import os
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

APP_URL = os.environ.get("APP_URL", "http://127.0.0.1:8000")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.set_default_navigation_timeout(8_000)
    page.set_default_timeout(5_000)
    errors = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto(APP_URL, wait_until="networkidle")
    assert page.get_by_text("ShortVideo Studio", exact=True).is_visible()
    assert page.get_by_role("tab", name="直接文案创作").is_visible()
    page.get_by_role("tab", name="根据本地视频改写").click()
    assert page.get_by_text("提取并改写", exact=True).is_visible()
    page.get_by_role("tab", name="直接文案创作").click()
    assert page.locator("select[name=asr_model]").count() == 0
    assert page.locator("select[name=rewrite_model]").count() == 0
    assert page.get_by_text("先得到一份可确认的口播稿", exact=True).is_visible()
    assert page.locator('.panel[data-panel="1"]').is_visible()
    page.locator('.workflow-drawer [data-panel-nav="2"]').click()
    assert page.locator('.panel[data-panel="2"]').is_visible()
    assert not page.locator('.panel[data-panel="1"]').is_visible()
    assert page.locator("#fish-controls").is_visible()
    assert page.locator("textarea[name=fish_style]").is_visible()
    assert page.locator("input[name=fish_speed]").input_value() == "1.00"
    assert page.get_by_role("button", name="快速配置").count() == 0
    assert page.get_by_role("button", name="精细设置").count() == 0
    assert page.get_by_role("button", name="应用推荐参数").count() == 0
    page.locator('.workflow-drawer [data-panel-nav="4"]').click()
    assert page.locator("input[name=broll_start]").input_value() == "5"
    page.locator('.workflow-drawer [data-panel-nav="5"]').click()
    assert page.locator("select[name=subtitle_font_size]").input_value() == "42"
    page.locator('.workflow-drawer [data-panel-nav="1"]').click()
    page.get_by_text("知识科普", exact=True).click()
    assert "应急储蓄" in page.locator("#ai-prompt").input_value()
    page.locator('.workflow-drawer [data-panel-nav="2"]').click()
    assert page.get_by_text("选择人物视频", exact=True).is_visible()
    assert page.locator("#person-submit").is_disabled()
    page.locator('.workflow-drawer [data-panel-nav="3"]').click()
    assert page.get_by_text("完成生成后，无字幕改口型结果会显示在这里", exact=True).is_visible()
    assert page.locator(".studio .panel").count() == 5
    duplicate_ids = page.locator("[id]").evaluate_all(
        "els => Object.values(els.reduce((m, e) => ((m[e.id] = (m[e.id] || 0) + 1), m), {})).filter(n => n > 1)"
    )
    assert duplicate_ids == []
    edit_keys = page.locator("#edit-form").evaluate("form => Array.from(new FormData(form).keys())")
    assert "title" in edit_keys
    assert "subtitle_enabled" in edit_keys
    page.locator('.workflow-drawer [data-panel-nav="5"]').click()
    assert page.locator('.panel[data-panel="5"]').is_visible()
    heights = page.locator(".studio").evaluate("(el) => [el.scrollHeight, el.clientHeight]")
    # Depending on the selected layout density, the fifth panel may either
    # scroll or fit exactly in the available work area; both are valid.
    assert heights[0] >= heights[1]
    assert not errors, errors

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(APP_URL, wait_until="networkidle")
    assert mobile.get_by_text("ShortVideo Studio", exact=True).is_visible()
    mobile.locator('.workflow-drawer [data-panel-nav="2"]').click()
    assert mobile.locator('.panel[data-panel="2"]').is_visible()
    page_widths = mobile.locator("html").evaluate("el => [el.scrollWidth, el.clientWidth]")
    assert page_widths[0] <= page_widths[1] + 1, page_widths
    mobile.close()
    settings = browser.new_page(viewport={"width": 1280, "height": 900})
    settings.goto(f"{APP_URL}?{urlencode({'settings': 'open'})}", wait_until="networkidle")
    settings.locator("#settings-dialog").wait_for(state="visible")
    # Settings may say a local key exists, but never return or prefill the
    # secret itself. A distributed build must require each user to type it.
    input_values = settings.locator("#settings-accounts-content input[data-field]").evaluate_all(
        "els => els.map(el => el.value)"
    )
    assert input_values and all(value == "" for value in input_values), input_values
    assert settings.locator('[data-settings-tab]').evaluate_all("els => els.map(el => el.dataset.settingsTab)") == ["accounts", "services", "ui"]
    settings.get_by_role("button", name="② 模型分配").click()
    assert settings.locator("#settings-services").is_visible()
    assert settings.locator("select[data-route]").count() == 6
    settings.get_by_role("button", name="① 账号与密钥").click()
    settings.get_by_role("button", name="＋ 添加服务账号").click()
    settings.locator("#service-account-dialog").wait_for(state="visible")
    settings.get_by_role("button", name="OpenAI 兼容服务").click()
    settings.get_by_role("button", name="下一步").click()
    assert settings.locator("#wizard-service-name").is_visible()
    settings.locator("#wizard-service-name").fill("测试服务")
    settings.locator("#wizard-service-url").fill("https://api.example.com/v1")
    settings.get_by_role("button", name="下一步").click()
    assert settings.get_by_text("文案创作与改写", exact=True).is_visible()
    settings.get_by_role("button", name="✕").last.click()
    settings.locator('#settings-close').click()
    assert page.locator('select[data-model-step]').count() == 0
    assert settings.get_by_text("必填", exact=True).count() == 0
    settings.close()
    browser.close()
print("UI smoke test passed")
