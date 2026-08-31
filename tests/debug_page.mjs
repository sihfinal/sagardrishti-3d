import puppeteer from "puppeteer-core"

const url = process.argv[2] ?? "http://localhost:8777/explore.html"

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

page.on("console", (m) => {
  const t = m.type()
  if (t === "error" || t === "warning")
    console.log(`[${t}]`, m.text().slice(0, 300))
})
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 500)))
page.on("requestfailed", (r) =>
  console.log("[reqfail]", r.url().slice(0, 120), r.failure()?.errorText)
)

await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 })
await new Promise((r) => setTimeout(r, 8000))

// probe the WebGL canvas: does it have non-black pixels?
const probe = await page.evaluate(() => {
  const c = document.querySelector("canvas")
  if (!c) return { canvas: false }
  try {
    const gl = c.getContext("webgl2") || c.getContext("webgl")
    if (!gl) return { canvas: true, webgl: false }
    const w = 200, h = 150
    const px = new Uint8Array(w * h * 4)
    gl.readPixels(
      Math.floor((gl.drawingBufferWidth - w) / 2),
      Math.floor((gl.drawingBufferHeight - h) / 2),
      w, h, gl.RGBA, gl.UNSIGNED_BYTE, px
    )
    let lit = 0
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++
    return {
      canvas: true, webgl: true, size: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
      litPercent: Math.round((lit / (w * h)) * 100),
    }
  } catch (e) {
    return { canvas: true, err: String(e).slice(0, 200) }
  }
})
console.log("[probe]", JSON.stringify(probe))
await page.screenshot({ path: process.argv[3] ?? "debug.png" })
await browser.close()
