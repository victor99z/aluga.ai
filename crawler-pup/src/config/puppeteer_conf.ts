import "dotenv/config";

export const init_conf = {
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  defaultViewport: {
    width: 1366,
    height: 768,
  },
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
  },
};

export const user_agent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36";
