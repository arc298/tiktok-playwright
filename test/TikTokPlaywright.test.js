const { firefox } = require('playwright')
const fs = require('fs')
const CaptchaSolver = require('tiktok-captcha-solver')
const ora = require('ora')

const TikTokPlaywright = require('../src/TikTokPlaywright')
const getFilesIn = require('../src/helpers/getFilesIn')
const scrollToBottom = require('../src/helpers/scrollToBottom')
const extractVideoUrlAndFilename = require('../src/helpers/extractVideoUrlAndFilename')
const downloadVideo = require('../src/helpers/downloadVideo')

jest.mock('playwright', () => {
  return {
    firefox: {
      launch: jest.fn(() => ({
        newContext: jest.fn(() => ({
          newPage: jest.fn(),
        })),
      })),
    },
  }
})

jest.mock('../src/helpers/getFilesIn')
jest.mock('../src/helpers/scrollToBottom')
jest.mock('fs')
jest.mock('../src/helpers/extractVideoUrlAndFilename')
jest.mock('../src/helpers/downloadVideo')
jest.mock('ora')
jest.mock('tiktok-captcha-solver')

describe('TikTokPlaywright', () => {
  let tiktok

  beforeEach(() => {
    tiktok = new TikTokPlaywright()
    tiktok.spinner = {
      text: '',
      fail: jest.fn(),
      succeed: jest.fn(),
    }
  })

  describe('_initialize', () => {
    beforeEach(async () => {
      jest.spyOn(TikTokPlaywright, 'createDownloadDir')
      getFilesIn.mockReturnValue({ file: true })

      await tiktok._initialize()
    })

    it('launches firefox', () => {
      expect(firefox.launch).toBeCalled()
    })

    it('creates a new context', () => {
      const browser = firefox.launch.mock.results[0].value
      expect(browser.newContext).toBeCalled()
    })

    it('creates a new page from the context', () => {
      const browser = firefox.launch.mock.results[0].value
      const context = browser.newContext.mock.results[0].value
      expect(context.newPage).toBeCalled()
    })

    it('creates the download dir', () => {
      expect(TikTokPlaywright.createDownloadDir).toBeCalledWith(
        tiktok.downloadDir
      )
    })

    it('gets the files in the download dir', () => {
      expect(getFilesIn).toBeCalledWith(tiktok.downloadDir)
      expect(tiktok.filesInDownloadDir).toEqual({ file: true })
    })
  })

  describe('_navigateTo', () => {
    beforeEach(async () => {
      jest.spyOn(tiktok, '_responseHandler')

      tiktok.page = {
        on: jest.fn(),
        goto: jest.fn(),
        waitForFunction: jest.fn((cb) => cb()),
        waitForLoadState: jest.fn(),
      }

      await tiktok._navigateTo('user')
    })

    it('initializes the captcha solver', () => {
      expect(CaptchaSolver).toBeCalledWith(tiktok.page)
    })

    it('adds a response listener', () => {
      expect(tiktok.page.on).toBeCalledWith(
        'response',
        tiktok._responseHandler.mock.results[0].value
      )
    })

    it('go to the user page', () => {
      expect(tiktok.page.goto).toBeCalledWith('https://www.tiktok.com/@user')
    })

    it('wait for the network to be idle', () => {
      expect(tiktok.page.waitForLoadState).toBeCalledWith('networkidle')
    })

    it('solves the captcha', () => {
      expect(tiktok.catchaSolver.solve).toBeCalled()
    })
  })

  describe('createDownloadDir', () => {
    beforeEach(() => {
      fs.mkdirSync.mockClear()
    })

    describe('when the dir exists', () => {
      beforeEach(() => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true)
        TikTokPlaywright.createDownloadDir('./test')
      })

      it('does not make the dir', () => {
        expect(fs.mkdirSync).not.toBeCalled()
      })
    })

    describe('when the dir does NOT exist', () => {
      beforeEach(() => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(false)
        TikTokPlaywright.createDownloadDir('./test')
      })

      it('makes the dir', () => {
        expect(fs.mkdirSync).toBeCalledWith('./test', { recursive: true })
      })
    })
  })

  describe('_scrollToBottom', () => {
    beforeEach(async () => {
      tiktok.page = {
        click: jest.fn(),
        $: jest.fn(),
      }

      await tiktok._scrollToBottom()
    })

    it('scrolls to the bottom', () => {
      expect(scrollToBottom).toBeCalled()
    })
  })

  describe('_hoverVideoFeedItems', () => {
    beforeEach(async () => {
      tiktok.page = {
        $$: jest.fn(() => [{ hover: jest.fn() }]),
      }

      tiktok.context = 'context'
      tiktok.downloadDir = './user'

      await tiktok._hoverVideoFeedItems()
    })

    it('hovers over each video item', () => {
      const videoFeedItems = tiktok.page.$$.mock.results[0].value

      videoFeedItems.forEach((videoFeedItem) => {
        expect(videoFeedItem.hover).toBeCalled()
      })
    })
  })

  describe('_shouldDownload', () => {
    describe('when redownload is true', () => {
      beforeEach(() => {
        tiktok.redownload = true
      })

      describe('and the file is in the download dir', () => {
        beforeEach(() => {
          tiktok.filesInDownloadDir = {
            filename: true,
          }
        })

        describe('and is already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {
              videoUrl: 'downloadVideo',
            }
          })

          it('returns false', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(
              false
            )
          })
        })

        describe('and is NOT already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {}
          })

          it('returns true', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(true)
          })
        })
      })

      describe('and the file is NOT in the download dir', () => {
        beforeEach(() => {
          tiktok.filesInDownloadDir = {}
        })

        describe('and is already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {
              videoUrl: 'downloadVideo',
            }
          })

          it('returns false', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(
              false
            )
          })
        })

        describe('and is NOT already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {}
          })

          it('returns true', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(true)
          })
        })
      })
    })

    describe('when redownload is false', () => {
      beforeEach(() => {
        tiktok.redownload = false
      })

      describe('and the file is in the download dir', () => {
        beforeEach(() => {
          tiktok.filesInDownloadDir = {
            filename: true,
          }
        })

        describe('and is already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {
              videoUrl: 'downloadVideo',
            }
          })

          it('returns false', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(
              false
            )
          })
        })

        describe('and is NOT already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {}
          })

          it('returns false', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(
              false
            )
          })
        })
      })

      describe('and the file is NOT in the download dir', () => {
        beforeEach(() => {
          tiktok.filesInDownloadDir = {}
        })

        describe('and is already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {
              videoUrl: 'downloadVideo',
            }
          })

          it('returns false', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(
              false
            )
          })
        })

        describe('and is NOT already in pending downloads', () => {
          beforeEach(() => {
            tiktok.pendingDownloads = {}
          })

          it('returns true', () => {
            expect(tiktok._shouldDownload('filename', 'videoUrl')).toEqual(true)
          })
        })
      })
    })
  })

  describe('_responseHandler', () => {
    let context, response, invokeDownloadComplete

    beforeEach(() => {
      jest.spyOn(tiktok, '_onDownloadComplete')

      extractVideoUrlAndFilename.mockReturnValue({
        videoUrl: 'videoUrl',
        filename: 'filename.mp4',
      })

      downloadVideo.mockClear()
      downloadVideo.mockReturnValue({
        then: (cb) => {
          invokeDownloadComplete = cb
          return 'downloadVideo'
        },
      })

      context = {
        cookies: () => [
          { name: 'cookieName1', value: 'cookieValue1' },
          { name: 'cookieName2', value: 'cookieValue2' },
        ],
      }

      response = {
        url: () => {},
      }

      tiktok.downloadDir = './user'
    })

    describe('when the content-type includes video', () => {
      beforeEach(() => {
        response.headers = () => ({
          'content-type': 'video/mp4',
        })
      })

      describe('and the file is NOT already in the downloads dir', () => {
        beforeEach(() => {
          tiktok.filesInDownloadDir = {}
        })

        describe('and is NOT already in pending downloads', () => {
          beforeEach(async () => {
            await tiktok._responseHandler(context)(response)
          })

          it('downloads the video', () => {
            expect(downloadVideo).toBeCalledWith(
              'videoUrl',
              './user/filename.mp4',
              'cookieName1=cookieValue1; cookieName2=cookieValue2'
            )
          })

          it('adds the download to pendingDownloads', () => {
            expect(tiktok.pendingDownloads['videoUrl']).toEqual('downloadVideo')
          })

          describe('when the download is complete', () => {
            beforeEach(() => {
              invokeDownloadComplete()
            })

            it('invokes download complete handler', () => {
              expect(tiktok._onDownloadComplete).toBeCalled()
            })
          })
        })

        describe('and is already in pending downloads', () => {
          beforeEach(async () => {
            tiktok.pendingDownloads['videoUrl'] = 'downloadVideo'

            await tiktok._responseHandler(context)(response)
          })

          it('does NOT download the video', () => {
            expect(downloadVideo).not.toBeCalled()
          })
        })
      })

      describe('and the file is in the downloads dir', () => {
        beforeEach(() => {
          tiktok.filesInDownloadDir = { 'filename.mp4': true }
        })

        describe('and is NOT already in pending downloads', () => {
          beforeEach(async () => {
            await tiktok._responseHandler(context)(response)
          })

          it('does NOT download the video', () => {
            expect(downloadVideo).not.toBeCalled()
            expect(tiktok.pendingDownloads['videoUrl']).toBeUndefined()
          })
        })

        describe('and is already in pending downloads', () => {
          beforeEach(async () => {
            tiktok.pendingDownloads['videoUrl'] = 'downloadVideo'

            await tiktok._responseHandler(context)(response)
          })

          it('does NOT download the video', () => {
            expect(downloadVideo).not.toBeCalled()
          })
        })
      })
    })

    describe('when the content-type does NOT include video', () => {
      beforeEach(async () => {
        response.headers = () => undefined

        await tiktok._responseHandler(context)(response)
      })

      it('does not download', () => {
        expect(downloadVideo).not.toBeCalled()
      })

      it('does not add a download', () => {
        expect(tiktok.pendingDownloads).toEqual({})
      })
    })
  })

  describe('_onDownloadComplete', () => {
    beforeEach(() => {
      tiktok.downloadsCompleted = 0
    })

    describe('when there are no videoFeedItems', () => {
      beforeEach(() => {
        tiktok._onDownloadComplete()
      })

      it('increments the downloadComplete counter', () => {
        expect(tiktok.downloadsCompleted).toEqual(1)
      })

      it('does NOT change the spinner text', () => {
        expect(tiktok.spinner.text).toEqual('')
      })
    })

    describe('when there are videoFeedItems', () => {
      beforeEach(() => {
        tiktok.videoFeedItems = ['videoFeedItem']
        tiktok._onDownloadComplete()
      })

      it('increments the downloadComplete counter', () => {
        expect(tiktok.downloadsCompleted).toEqual(1)
      })

      it('changes the spinner text', () => {
        expect(tiktok.spinner.text).toContain(
          'Downloading videos [1 completed]'
        )
      })
    })
  })

  describe('_waitForDownloads', () => {
    describe('when all pending downloads have settled', () => {
      beforeEach(() => {
        jest.spyOn(tiktok, '_tearDown').mockImplementation()
      })

      describe('and there is only one download completed', () => {
        beforeEach(() => {
          tiktok.downloadsCompleted = 1
          tiktok._waitForDownloads()
        })

        it('calls succeed on the spinner', () => {
          expect(tiktok.spinner.succeed).toBeCalledWith(
            expect.stringContaining('Downloaded')
          )
          expect(tiktok.spinner.succeed).toBeCalledWith(
            expect.stringContaining('video')
          )
        })

        it('invokes tearDown', () => {
          expect(tiktok._tearDown).toBeCalled()
        })
      })

      describe('and there is more than one download completed', () => {
        beforeEach(() => {
          tiktok.downloadsCompleted = 2
          tiktok._waitForDownloads()
        })

        it('calls succeed on the spinner', () => {
          expect(tiktok.spinner.succeed).toBeCalledWith(
            expect.stringContaining('Downloaded')
          )
          expect(tiktok.spinner.succeed).toBeCalledWith(
            expect.stringContaining('videos')
          )
        })

        it('invokes tearDown', () => {
          expect(tiktok._tearDown).toBeCalled()
        })
      })
    })
  })

  describe('_onError', () => {
    let result, error

    beforeEach(async () => {
      jest.spyOn(Promise, 'reject').mockReturnValue(error)
      jest.spyOn(tiktok, '_tearDown').mockImplementation()

      error = new Error('error')
      result = await tiktok._onError(error)
    })

    it('invokes tearDown', () => {
      expect(tiktok._tearDown).toBeCalled()
    })

    it('returns a rejected Promise', () => {
      expect(Promise.reject).toBeCalledWith(error)
      expect(result).toEqual(error)
    })
  })

  describe('_tearDown', () => {
    beforeEach(async () => {
      tiktok.page = { close: jest.fn() }
      tiktok.context = { close: jest.fn() }
      tiktok.browser = { close: jest.fn() }

      await tiktok._tearDown()
    })

    it('closes the page', () => {
      expect(tiktok.page.close).toBeCalled()
    })

    it('closes the context', () => {
      expect(tiktok.context.close).toBeCalled()
    })

    it('closes the browser', () => {
      expect(tiktok.browser.close).toBeCalled()
    })
  })

  describe('download', () => {
    beforeEach(() => {
      ora.mockReturnValue({ start: jest.fn() })
    })

    describe('when all download actions succeed', () => {
      beforeEach(async () => {
        jest.spyOn(tiktok, '_initialize').mockReturnValue(Promise.resolve())
        jest.spyOn(tiktok, '_navigateTo').mockImplementation()
        jest.spyOn(tiktok, '_scrollToBottom').mockImplementation()
        jest.spyOn(tiktok, '_hoverVideoFeedItems').mockImplementation()
        jest.spyOn(tiktok, '_waitForDownloads').mockImplementation()

        await tiktok.download('user', './user')
      })

      it('initializes ora with the quiet option and starts the spinner', () => {
        expect(ora).toBeCalledWith({ isSilent: true })
        expect(ora.mock.results[0].value.start).toBeCalled()
      })

      it('invokes initialize, navigateTo, scrollToBottom, downloadVideos, and cleanUp', () => {
        expect(tiktok._initialize).toBeCalled()
        expect(tiktok._navigateTo).toBeCalled()
        expect(tiktok._scrollToBottom).toBeCalled()
        expect(tiktok._hoverVideoFeedItems).toBeCalled()
        expect(tiktok._waitForDownloads).toBeCalled()
      })
    })

    describe('when a download action fails', () => {
      beforeEach(async () => {
        jest.spyOn(tiktok, '_initialize').mockRejectedValue('error')
        jest.spyOn(tiktok, '_onError').mockImplementation()

        await tiktok.download('user', './user')
      })

      it('invokes the onError handler with the error', () => {
        expect(tiktok._onError).toBeCalledWith('error')
      })
    })
  })
})
