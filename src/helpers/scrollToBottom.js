const scrollToBottom = async (page, distance = 100, delay = 400) => {
  while (await page.evaluate(() => document.scrollingElement.scrollTop + window.innerHeight < document.scrollingElement.scrollHeight)) {
    await page.evaluate((distance) => {
      document.scrollingElement.scrollBy(0, distance);
    }, distance)
    await page.waitForTimeout(delay)
  }
}

module.exports = scrollToBottom
