const { existsSync, mkdirSync } = require('fs')

const { firefox } = require('playwright')
const ora = require('ora')

const getUser = require('./helpers/getUser')
const getFilesIn = require('./helpers/getFilesIn')
const scrollToBottom = require('./helpers/scrollToBottom')
const extractVideoUrlAndFilename = require('./helpers/extractVideoUrlAndFilename')
const downloadVideo = require('./helpers/downloadVideo')
const CaptchaSolver = require('tiktok-captcha-solver')

class TikTokPlaywright {
  user
  downloadDir
  redownload

  browser
  context
  page

  filesInDownloadDir = {}
  videoFeedItems = []
  pendingDownloads = {}
  downloadsCompleted = 0

  spinner

  get defaults() {
    return {
      quiet: true,
      redownload: false,
    }
  }

  async download(user, options) {
    const { downloadDir, redownload, quiet } = Object.assign(
      this.defaults,
      { downloadDir: `./${getUser(user)}` },
      options
    )

    this.user = user
    this.downloadDir = downloadDir
    this.redownload = redownload

    this.spinner = ora({ isSilent: quiet }).start('Initializing')

    return await this._initialize()
      .then(async () => await this._navigateTo(this.user))
      .then(async () => await this._scrollToBottom())
      .then(async () => await this._hoverVideoFeedItems())
      .then(async () => await this._waitForDownloads())
      .catch(async (e) => await this._onError(e))
  }

  async _initialize() {
    this.browser = await firefox.launch({
      headless: true,
      devtools: false,
    })

    this.context = await this.browser.newContext({ ignoreHTTPSErrors: true })
    this.page = await this.context.newPage()

    TikTokPlaywright.createDownloadDir(this.downloadDir)
    this.filesInDownloadDir = await getFilesIn(this.downloadDir)
  }

  async _navigateTo(user) {
    this.catchaSolver = new CaptchaSolver(this.page)
    this.page.on('response', this._responseHandler(this.context))

    this.spinner.text = `Navigating to ${user}`

    await this.page.goto(`https://www.tiktok.com/login`)
    await this.page.goto(`https://www.tiktok.com/@${user}`)
    await this.page.waitForLoadState('networkidle')

    this.spinner.text = `Solving captcha`
    return await this.catchaSolver.solve()
  }

  async _scrollToBottom() {
    this.spinner.text = 'Scrolling through videos'
    return await scrollToBottom(this.page, 5000, 2000)
  }

  async _hoverVideoFeedItems() {
    this.spinner.text = 'Downloading videos'

    this.videoFeedItems = await this.page.$$('[data-e2e="user-post-item"]')

    for (const item of this.videoFeedItems) {
      await item.hover()
    }
  }

  static createDownloadDir(dir) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  _responseHandler(context) {
    return async (response) => {
      const contentType = (response.headers() || {})['content-type']

      if (contentType && contentType.includes('video/')) {
        const { videoUrl, filename } = extractVideoUrlAndFilename(
          response.url(),
          contentType
        )
        const cookies = await context.cookies()
        const cookieString = cookies
          .map(({ name, value }) => `${name}=${value}`)
          .join('; ')

        if (this._shouldDownload(filename, videoUrl)) {
          this.pendingDownloads[videoUrl] = downloadVideo(
            videoUrl,
            `${this.downloadDir}/${filename}`,
            cookieString
          ).then(() => this._onDownloadComplete())
        }
      }
    }
  }

  _shouldDownload(filename, videoUrl) {
    const inDownloadsDir = filename in this.filesInDownloadDir
    const inPendingDownloads = videoUrl in this.pendingDownloads

    return (
      (this.redownload && !inPendingDownloads) ||
      (!this.redownload && !inDownloadsDir && !inPendingDownloads)
    )
  }

  _onDownloadComplete() {
    this.downloadsCompleted++

    if (this.videoFeedItems.length) {
      this.spinner.text = `Downloading videos [${this.downloadsCompleted} completed]`
    }
  }

  _waitForDownloads() {
    Promise.allSettled(Object.values(this.pendingDownloads)).then(async () => {
      this.spinner.succeed(
        `Downloaded ${this.downloadsCompleted} video${
          this.downloadsCompleted > 1 ? 's' : ''
        } for ${this.user}`
      )
      await this._tearDown()
    })
  }

  async _onError(e) {
    this.spinner.fail(e.message)

    await this._tearDown()
    return Promise.reject(e)
  }

  async _tearDown() {
    await this.page.close()
    await this.context.close()
    await this.browser.close()
  }
}

module.exports = TikTokPlaywright
