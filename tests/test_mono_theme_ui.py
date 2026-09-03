import os

import pytest
from playwright.sync_api import sync_playwright


APP_URL = os.environ.get("APP_URL")


@pytest.mark.skipif(not APP_URL, reason="set APP_URL to run the live monochrome UI check")
def test_monochrome_theme_ui():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.add_init_script("localStorage.setItem('ui-hue', 'mono')")
        page.goto(APP_URL, wait_until="networkidle")
        print("Loaded monochrome page", flush=True)
        assert page.locator("body").evaluate("el => el.classList.contains('biz')")
        olive = page.locator("body").evaluate(
            "el => getComputedStyle(el).getPropertyValue('--olive').trim()"
        )
        assert olive == "#111111", olive
        assert page.locator('#reference-file').evaluate(
            "el => getComputedStyle(el, '::placeholder').color"
        ) == "rgb(136, 136, 136)"
        assert page.locator('#reference-file').evaluate(
            "el => getComputedStyle(el).backgroundColor"
        ) == "rgb(255, 255, 255)"
        page.screenshot(path="outputs/monochrome-theme.png", full_page=True)
        print("Validated monochrome styles", flush=True)

        browser.close()
