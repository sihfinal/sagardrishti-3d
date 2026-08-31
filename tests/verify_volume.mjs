import puppeteer from "puppeteer-core"

// Verify the volume block: initial view, then play animation, screenshot both.
const url = process.argv[2] ?? "http://localhost:8777/explore.html"
const out1 = process.argv[3] ?? "verify_1.png"
const out2 = process.argv[4] ?? "verify_2.png"

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)))

await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 })
await new Promise((r) => setTimeout(r, 9000))
await page.screenshot({ path: out1 })
console.log("saved", out1)

// click Play (the button inside DATA & TIME)
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")]
  const play = btns.find((b) => b.textContent?.trim() === "Play")
  if (play) {
    play.click()
    return true
  }
  return false
})
console.log("play clicked:", clicked)
await new Promise((r) => setTimeout(r, 4500))
await page.screenshot({ path: out2 })
console.log("saved", out2)
await browser.close()
