from playwright.sync_api import sync_playwright

OUTPUT = r"C:\Users\28257\.codex\visualizations\2026\08\02\019fc14d-11bb-70e3-9982-f3fb971e3ba8\talkforge-workbench.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 980}, device_scale_factor=1)
    page.goto("http://127.0.0.1:8000", wait_until="networkidle")
    page.screenshot(path=OUTPUT)
    browser.close()
print(OUTPUT)
