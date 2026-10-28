import XCTest

final class TransferGenieSimulatorUITests: XCTestCase {
    private let bundleIdentifier = "com.transfergenie"
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication(bundleIdentifier: bundleIdentifier)
        // This pre-upgrade guard must inspect an already-running draft without
        // launch() terminating its process before the check can protect it.
        if name.contains("testComposerDraftIsEmptyBeforeUpgrade") { app.activate() }
        else { app.launch() }
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30), "The signed-in mobile shell did not become ready")
    }

    override func tearDownWithError() throws {
        app = nil
    }

    func testComposerDraftIsEmptyBeforeUpgrade() throws {
        guard app.buttons["新消息"].isHittable else {
            throw XCTSkip("An editor is already open; preserve the current process")
        }
        app.buttons["新消息"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let value = editor.value as? String
        defer { if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() } }
        let emptyEditorValues = ["", "输入文字，或加入照片和文件…", "写下你的想法…\n选中文字，用上方工具添加格式。"]
        guard let value, emptyEditorValues.contains(value),
              app.buttons.matching(identifier: "移除附件").count == 0,
              !app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记")).firstMatch.exists,
              !app.staticTexts["草稿自动保存失败"].exists else {
            throw XCTSkip("Preserve an existing unsent draft before replacement installation")
        }
    }

    func testCleanupKnownMarkdownToolbarFixture() throws {
        if !app.buttons["关闭新消息"].exists, app.buttons["新消息"].isHittable { app.buttons["新消息"].tap() }
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let fixture = "# TG Markdown UI\n\n**bold fixture** and `code`"
        let value = (editor.value as? String ?? "").trimmingCharacters(in: .newlines)
        guard value == fixture, app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Only the exact attachment-free toolbar fixture may be removed")
        }
        clearVerifiedComposerFixture(editor)
        XCTAssertTrue(NSPredicate { _, _ in
            let current = editor.value as? String ?? ""
            return current.isEmpty || current == "输入文字，或加入照片和文件…"
        }.evaluate(with: nil))
        dismissKeyboardIfNeeded()
        app.buttons["关闭新消息"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
    }

    func testUnsentMarkdownDraftSurvivesTermination() throws {
        if app.buttons["新消息"].exists { app.buttons["新消息"].tap() }
        XCTAssertTrue(app.switches["文字"].waitForExistence(timeout: 5))
        app.switches["文字"].tap()
        var editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let original = editor.value as? String ?? ""
        let priorFixture = "# TG Markdown UI\n\n**bold fixture** and `code`"
        let fixture = "# TG-DRAFT-RESTORE-20261027\n\n**unsent fixture**"
        let knownFixture = [priorFixture, fixture, fixture + priorFixture].contains(original.trimmingCharacters(in: .newlines))
        guard (original.isEmpty || original.hasPrefix("输入文字") || original.hasPrefix("写下你的想法") || knownFixture), app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Preserve an existing unsent draft")
        }
        if knownFixture { clearVerifiedComposerFixture(editor) }
        defer {
            if app.switches["文字"].exists { app.switches["文字"].tap() }
            editor = composerEditor()
            if editor.exists, (editor.value as? String)?.trimmingCharacters(in: .newlines) == fixture {
                clearVerifiedComposerFixture(editor)
            }
            if app.switches["文字"].exists { app.switches["文字"].tap() }
            if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() }
        }
        editor.tap()
        editor.typeText(fixture)
        app.switches["Markdown"].tap()
        XCTAssertTrue(app.staticTexts["草稿已自动保存"].waitForExistence(timeout: 10))
        app.buttons["关闭新消息"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertTrue(app.switches["粗体"].waitForExistence(timeout: 5), "Restored Markdown opens directly in the rendered editor")
        XCTAssertFalse(app.switches["预览"].exists)
        attachScreenshot(named: "restored-unsent-wysiwyg-markdown")
        app.switches["文字"].tap()
        editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual((editor.value as? String)?.trimmingCharacters(in: .newlines), fixture)
        attachScreenshot(named: "restored-unsent-markdown-draft")
    }

    func testMarkdownEditorPreviewAndCancelledMarkSettings() throws {
        XCUIDevice.shared.orientation = .portrait
        if !app.buttons["关闭新消息"].exists, app.buttons["新消息"].isHittable { app.buttons["新消息"].tap() }
        dismissKeyboardIfNeeded()
        XCTAssertTrue(app.switches["文字"].waitForExistence(timeout: 5))
        app.switches["文字"].tap()
        var editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let original = editor.value as? String ?? ""
        let draft = "# TG Markdown UI\n\n**bold fixture** and `code`"
        guard (original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || original == "输入文字，或加入照片和文件…" || original.trimmingCharacters(in: .newlines) == draft), app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Preserve an existing unsent draft")
        }
        defer {
            if app.buttons["关闭编辑标记"].exists { app.buttons["关闭编辑标记"].tap() }
            if app.buttons["收起键盘"].exists { app.buttons["收起键盘"].tap() }
            else { dismissKeyboardIfNeeded() }
            if app.switches["文字"].exists { app.switches["文字"].tap() }
            editor = composerEditor()
            if editor.exists {
                editor.tap()
                if let value = editor.value as? String, value.trimmingCharacters(in: .newlines) == draft {
                    clearVerifiedComposerFixture(editor)
                }
            }
            if app.switches["文字"].exists { app.switches["文字"].tap() }
            if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() }
        }
        editor.tap()
        if original.trimmingCharacters(in: .newlines) != draft { editor.typeText(draft) }
        dismissKeyboardIfNeeded()
        app.switches["Markdown"].tap()
        let heading = app.switches["标题"]
        XCTAssertTrue(heading.waitForExistence(timeout: 5))
        XCTAssertTrue(heading.isHittable)
        let firstTool = app.switches["粗体"]
        XCTAssertGreaterThanOrEqual(firstTool.frame.width, 44)
        XCTAssertGreaterThanOrEqual(firstTool.frame.height, 44)
        XCTAssertTrue(app.switches["增加缩进"].exists)
        XCTAssertTrue(app.switches["减少缩进"].exists)
        XCTAssertFalse(app.switches["预览"].exists)
        let richEditor = composerEditor()
        XCTAssertTrue(richEditor.waitForExistence(timeout: 5))
        richEditor.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "The rendered editor must keep the software keyboard open")
        let dismissTool = app.buttons["收起键盘"]
        XCTAssertTrue(dismissTool.waitForExistence(timeout: 5))
        XCTAssertEqual(dismissTool.frame.minX, app.frame.minX, accuracy: 1, "Keyboard dismiss must be the first toolbar icon")
        let aboveKeyboard = NSPredicate { _, _ in
            dismissTool.frame.maxY <= self.app.keyboards.firstMatch.frame.minY
        }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: aboveKeyboard, object: nil)], timeout: 5), .completed, "The formatting toolbar must stay above the software keyboard")
        let assistantButtons = app.buttons.matching(NSPredicate(format: "label IN %@", ["Previous", "Next", "上一个", "下一个", "上一项", "下一项"]))
        for index in 0..<assistantButtons.count {
            let assistant = assistantButtons.element(boundBy: index)
            if assistant.isHittable && assistant.frame.minY > richEditor.frame.minY {
                XCTAssertLessThanOrEqual(dismissTool.frame.maxY, assistant.frame.minY - 4, "Formatting tools must not overlap the system input assistant")
            }
        }
        attachScreenshot(named: "fullscreen-wysiwyg-keyboard-toolbar")
        XCTAssertFalse(app.buttons["发送"].isHittable, "Only formatting tools follow the software keyboard")
        app.buttons["收起键盘"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "Dismiss the keyboard without closing the draft")
        button(containing: "标记").tap()
        XCTAssertTrue(app.staticTexts["标记设置"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["保存标记"].exists)
        XCTAssertTrue(app.textFields["新标签名称"].exists)
        let composerClose = app.buttons["关闭新消息"]
        XCTAssertTrue(!composerClose.exists || !composerClose.isHittable, "The retained composer must not be interactive beneath mark settings")
        attachScreenshot(named: "detailed-mark-settings")
        app.buttons["关闭编辑标记"].tap()
        XCTAssertTrue(app.switches["粗体"].waitForExistence(timeout: 5))
        app.switches["文字"].tap()
        editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual((editor.value as? String)?.trimmingCharacters(in: .newlines), draft)
        XCTAssertTrue(app.buttons["发送"].exists)
        // No send/save/confirm action is taken: all user messages stay unchanged.
    }

    func testComposerMarkSettingsSaveAndConfirmedRemoval() throws {
        app.buttons["新消息"].tap()
        app.switches["文字"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        var original = editor.value as? String ?? ""
        if original.trimmingCharacters(in: .newlines) == "# TG Markdown UI\n\n**bold fixture** and `code`" {
            clearVerifiedComposerFixture(editor)
            original = editor.value as? String ?? ""
        }
        let emptyValues = ["", "输入文字，或加入照片和文件…", "写下你的想法…\n选中文字，用上方工具添加格式。"]
        guard emptyValues.contains(original.trimmingCharacters(in: .whitespacesAndNewlines)),
              app.buttons.matching(identifier: "移除附件").count == 0,
              !app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记 ·")).firstMatch.exists else {
            throw XCTSkip("Preserve an existing draft before changing fixture mark settings")
        }
        dismissKeyboardIfNeeded()
        button(containing: "标记").tap()
        XCTAssertTrue(app.buttons["保存标记"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.switches["发送时标记"].exists)
        XCTAssertFalse(app.buttons["取消标记"].exists)
        attachScreenshot(named: "composer-mark-settings-without-checkbox")
        app.buttons["保存标记"].tap()
        let summary = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记 ·")).firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["关闭新消息"].exists)
        button(containing: "标记").tap()
        XCTAssertTrue(app.buttons["取消标记"].waitForExistence(timeout: 5))
        app.buttons["取消标记"].tap()
        XCTAssertTrue(app.buttons["确认取消标记"].waitForExistence(timeout: 5))
        app.buttons["保留标记"].tap()
        XCTAssertTrue(summary.waitForExistence(timeout: 5))
        button(containing: "标记").tap()
        app.buttons["取消标记"].tap()
        app.buttons["确认取消标记"].tap()
        XCTAssertTrue(app.buttons["关闭新消息"].waitForExistence(timeout: 5))
        XCTAssertFalse(summary.exists)
        XCTAssertEqual(composerEditor().value as? String ?? "", original)
        app.buttons["关闭新消息"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
    }

    func testFullScreenDetailMoreRowInBothOrientations() throws {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        let document = app.staticTexts["TG-IOS-PROBE-20261027-document.txt"]
        XCTAssertTrue(document.waitForExistence(timeout: 15))
        dismissSearchKeyboard()
        document.tap()
        defer {
            XCUIDevice.shared.orientation = .portrait
            if app.buttons["关闭编辑标记"].exists { app.buttons["关闭编辑标记"].tap() }
            if app.buttons["取消"].exists { app.buttons["取消"].tap() }
            if app.buttons["关闭详情"].exists { app.buttons["关闭详情"].tap() }
            if app.buttons["清除"].exists { app.buttons["清除"].tap() }
        }
        let more = app.buttons["更多"]
        XCTAssertTrue(more.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["关闭详情"].exists)
        for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            let aligned = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                let frame = more.frame
                let preview = self.app.buttons["系统预览"].frame
                let share = self.app.buttons["分享"].frame
                return abs(frame.minX - preview.minX) < 2 && abs(frame.maxX - share.maxX) < 2 && frame.minY >= preview.maxY && frame.height >= 44 && frame.maxY <= self.app.frame.maxY && more.isHittable
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [aligned], timeout: 5), .completed)
            attachScreenshot(named: "fullscreen-detail-\(orientation.rawValue)")
        }
        more.tap()
        XCTAssertTrue(button(containing: "复制").waitForExistence(timeout: 5))
        let editMark = button(containing: "编辑标签与截止日期")
        if editMark.exists { editMark.tap() } else { button(containing: "标记").tap() }
        XCTAssertTrue(app.buttons["关闭编辑标记"].waitForExistence(timeout: 5))
        let detailClose = app.buttons["关闭详情"]
        XCTAssertTrue(!detailClose.exists || !detailClose.isHittable)
        attachScreenshot(named: "detail-actions-under-mark-settings")
        app.buttons["关闭编辑标记"].tap()
        XCTAssertTrue(button(containing: "复制").waitForExistence(timeout: 5))
        app.buttons["取消"].tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(more.isHittable)
        XCTAssertTrue(document.exists)
    }

    func testMarkedLongMarkdownExcerptAndConfirmedCleanup() throws {
        let marker = "TG-MARK-FADE-" + UUID().uuidString
        app.buttons["新消息"].tap()
        app.switches["文字"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let original = editor.value as? String
        guard let original, ["", "输入文字，或加入照片和文件…"].contains(original),
              app.buttons.matching(identifier: "移除附件").count == 0,
              !app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记")).firstMatch.exists else {
            throw XCTSkip("Preserve user draft before marked excerpt fixture")
        }
        editor.tap()
        editor.typeText("# " + marker + "\n\n" + String(repeating: "**Readable fixture** with enough content to overflow.\n\n", count: 12))
        app.switches["Markdown"].tap()
        XCTAssertTrue(app.switches["粗体"].waitForExistence(timeout: 5))
        button(containing: "标记").tap()
        XCTAssertTrue(app.buttons["保存标记"].waitForExistence(timeout: 5))
        app.buttons["保存标记"].tap()
        XCTAssertTrue(app.buttons["发送"].waitForExistence(timeout: 5))
        app.buttons["发送"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
        app.buttons["标记"].tap()
        try verifyMarkedExcerptAndCleanup(marker: marker)
    }

    private func verifyMarkedExcerptAndCleanup(marker: String) throws {
        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", marker, "查看全文")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 20))
        attachScreenshot(named: "native-marked-gradient-excerpt")
        row.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[marker].exists)
        attachScreenshot(named: "native-marked-full-detail")
        app.buttons["关闭详情"].tap()
        let unmark = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", "取消标记 ", marker)).firstMatch
        XCTAssertTrue(unmark.waitForExistence(timeout: 5))
        unmark.tap()
        XCTAssertTrue(app.buttons["确认取消标记"].waitForExistence(timeout: 5))
        app.buttons["保留标记"].tap()
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        app.buttons["消息"].tap()
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(marker)
        let exactFixture = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", marker)).firstMatch
        XCTAssertTrue(exactFixture.waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        dismissSearchKeyboard()
        app.buttons["更多操作"].tap()
        XCTAssertTrue(button(containing: "删除消息（同步到云端）").waitForExistence(timeout: 5))
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
        app.buttons["清除"].tap()
    }

    func testAppPinchDoesNotScaleComposer() {
        XCUIDevice.shared.orientation = .portrait
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        let width = composerEditor().frame.width
        app.webViews.firstMatch.pinch(withScale: 1.8, velocity: 1)
        XCTAssertEqual(composerEditor().frame.width, width, accuracy: 1)
        XCTAssertTrue(app.buttons["关闭新消息"].isHittable)
        app.buttons["关闭新消息"].tap()
    }

    func testComposerCanBeOpenedByTouch() {
        let launcher = app.buttons["新消息"]
        XCTAssertTrue(launcher.waitForExistence(timeout: 10))
        XCTAssertTrue(launcher.isHittable)
        launcher.tap()
        XCTAssertTrue(app.buttons["关闭新消息"].waitForExistence(timeout: 5))
        XCTAssertTrue(composerEditor().exists)
        app.buttons["关闭新消息"].tap()
    }

    func testReleaseBuildExcludesSimulatorDebugHooks() throws {
        app.terminate()
        app.launchEnvironment["TRANSFER_GENIE_IOS_LAYOUT_PROBE"] = "1"
        app.launchEnvironment["TRANSFER_GENIE_IOS_SIMULATOR_AUTH_TEST"] = "expire-active-session"
        app.launchEnvironment["TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST"] = "no-space"
        defer {
            app.launchEnvironment.removeValue(forKey: "TRANSFER_GENIE_IOS_LAYOUT_PROBE")
            app.launchEnvironment.removeValue(forKey: "TRANSFER_GENIE_IOS_SIMULATOR_AUTH_TEST")
            app.launchEnvironment.removeValue(forKey: "TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST")
            app.terminate()
            app.launch()
        }
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        let original = composerEditor().value as? String ?? ""
        guard (original.isEmpty || original.hasPrefix("输入文字")), app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Preserve the existing draft before checking Release debug-hook exclusion")
        }
        XCTAssertFalse(app.staticTexts["Simulator layout geometry"].exists, "Release must exclude the Debug-only layout probe even when explicitly requested")
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        var fixture = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document"))
            .firstMatch
        if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
            browse.tap()
            fixture = app.descendants(matching: .any)
                .matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document"))
                .firstMatch
        }
        XCTAssertTrue(fixture.waitForExistence(timeout: 15))
        fixture.tap()
        let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
        XCTAssertNotNil(open)
        open?.tap()
        XCTAssertTrue(button(containing: "预览附件 TG-IOS-PROBE-20261027-document.txt").waitForExistence(timeout: 15), "Release must exclude the Debug-only no-space import hook")
        XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "存储空间不足")).firstMatch.exists)
        app.buttons["移除附件"].tap()
        XCTAssertFalse(app.buttons["移除附件"].exists)
        app.buttons["关闭新消息"].tap()
    }

    func testSystemReduceMotionToggleAndForegroundRecovery() throws {
        #if !targetEnvironment(simulator)
        throw XCTSkip("This test changes preferences only in the official Simulator")
        #else
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.activate()
        let accessibility = settings.staticTexts["辅助功能"]
        if accessibility.waitForExistence(timeout: 2) { accessibility.tap() }
        let motion = settings.staticTexts["动态效果"]
        if motion.waitForExistence(timeout: 2) { motion.tap() }
        let reduceMotion = settings.cells["REDUCE_MOTION"].switches.element(boundBy: 1)
        XCTAssertTrue(reduceMotion.waitForExistence(timeout: 5))
        let original = reduceMotion.value as? String
        defer {
            settings.activate()
            if reduceMotion.waitForExistence(timeout: 5), reduceMotion.value as? String != original { reduceMotion.tap() }
            let restored = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in reduceMotion.value as? String == original }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 5), .completed, "Restore original Simulator motion setting")
            app.activate()
        }
        reduceMotion.tap()
        let toggled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in reduceMotion.value as? String != original }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [toggled], timeout: 5), .completed)
        let settingsScreenshot = XCTAttachment(screenshot: settings.screenshot())
        settingsScreenshot.name = "system-reduce-motion-toggled"
        settingsScreenshot.lifetime = .keepAlways
        add(settingsScreenshot)
        app.activate()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 10))
        app.buttons["新消息"].tap()
        XCTAssertTrue(app.buttons["关闭新消息"].waitForExistence(timeout: 5))
        XCTAssertTrue(composerEditor().isHittable)
        attachScreenshot(named: "foreground-after-system-motion-change")
        app.buttons["关闭新消息"].tap()
        #endif
    }

    func testSetPhysicalDeviceAutoLockToNever() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Auto-Lock is changed only on the explicitly authorized physical test device")
        #else
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.terminate()
        settings.launch()
        XCTAssertTrue(settings.wait(for: .runningForeground, timeout: 10))

        func firstSetting(_ labels: [String]) -> XCUIElement? {
            for label in labels {
                let exact = settings.descendants(matching: .any)
                    .matching(NSPredicate(format: "label == %@ OR identifier == %@", label, label))
                    .firstMatch
                if exact.exists { return exact }
            }
            return nil
        }

        let displayLabels = ["显示与亮度", "Display & Brightness"]
        for _ in 0..<8 where firstSetting(displayLabels) == nil {
            let back = settings.navigationBars.buttons.element(boundBy: 0)
            if back.exists && back.isHittable { back.tap() } else { break }
        }
        for _ in 0..<5 where firstSetting(displayLabels) == nil { settings.swipeUp() }
        guard let display = firstSetting(displayLabels) else {
            let hierarchy = XCTAttachment(string: settings.debugDescription)
            hierarchy.name = "settings-root-before-auto-lock"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
            XCTFail("Display & Brightness is not reachable in Settings")
            app.activate()
            return
        }
        display.tap()

        let autoLockLabels = ["自动锁定", "Auto-Lock"]
        for _ in 0..<5 where firstSetting(autoLockLabels) == nil { settings.swipeUp() }
        guard let autoLock = firstSetting(autoLockLabels) else {
            XCTFail("Auto-Lock is not reachable in Display & Brightness")
            app.activate()
            return
        }
        let containingCell = settings.cells.containing(.staticText, identifier: autoLock.label).firstMatch
        let original = "label=\(containingCell.exists ? containingCell.label : autoLock.label); value=\(containingCell.exists ? String(describing: containingCell.value) : String(describing: autoLock.value))"
        print("AUTO_LOCK_ORIGINAL \(original)")
        let originalAttachment = XCTAttachment(string: original)
        originalAttachment.name = "auto-lock-original-value"
        originalAttachment.lifetime = .keepAlways
        add(originalAttachment)
        autoLock.tap()

        let neverLabels = ["永不", "Never"]
        guard let never = firstSetting(neverLabels) else {
            XCTFail("Never is not available; Low Power Mode or a device policy may be forcing Auto-Lock")
            app.activate()
            return
        }
        never.tap()
        let back = settings.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.waitForExistence(timeout: 5), "Auto-Lock screen did not expose its back button")
        back.tap()
        let updatedCell = settings.cells["AUTOLOCK"]
        guard updatedCell.waitForExistence(timeout: 5) else {
            XCTFail("Could not return to the Auto-Lock summary cell")
            app.activate()
            return
        }
        let updated = "label=\(updatedCell.label); value=\(String(describing: updatedCell.value))"
        print("AUTO_LOCK_UPDATED \(updated)")
        XCTAssertTrue(updated.contains("永不") || updated.localizedCaseInsensitiveContains("Never"), "Auto-Lock summary did not change to Never")
        let screenshot = XCTAttachment(screenshot: settings.screenshot())
        screenshot.name = "auto-lock-set-to-never"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.activate()
        #endif
    }

    func testRestorePhysicalDeviceAutoLockToFiveMinutes() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("Auto-Lock is restored only on the explicitly authorized physical test device")
        #else
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.terminate()
        settings.launch()
        XCTAssertTrue(settings.wait(for: .runningForeground, timeout: 10))

        func firstSetting(_ labels: [String]) -> XCUIElement? {
            for label in labels {
                let exact = settings.descendants(matching: .any)
                    .matching(NSPredicate(format: "label == %@ OR identifier == %@", label, label))
                    .firstMatch
                if exact.exists { return exact }
            }
            return nil
        }

        let displayLabels = ["显示与亮度", "Display & Brightness"]
        for _ in 0..<8 where firstSetting(displayLabels) == nil {
            let back = settings.navigationBars.buttons.element(boundBy: 0)
            if back.exists && back.isHittable { back.tap() } else { break }
        }
        for _ in 0..<5 where firstSetting(displayLabels) == nil { settings.swipeUp() }
        guard let display = firstSetting(displayLabels) else {
            XCTFail("Display & Brightness is not reachable in Settings")
            app.activate()
            return
        }
        display.tap()

        let autoLockLabels = ["自动锁定", "Auto-Lock"]
        for _ in 0..<5 where firstSetting(autoLockLabels) == nil { settings.swipeUp() }
        guard let autoLock = firstSetting(autoLockLabels) else {
            XCTFail("Auto-Lock is not reachable in Display & Brightness")
            app.activate()
            return
        }
        autoLock.tap()

        let fiveMinutes = firstSetting(["5 分钟", "5分钟", "5 Minutes"])
            ?? settings.descendants(matching: .any)
                .matching(NSPredicate(format: "(label CONTAINS '5' OR value CONTAINS '5') AND (label CONTAINS '分钟' OR label CONTAINS[c] 'minute' OR value CONTAINS '分钟' OR value CONTAINS[c] 'minute')"))
                .firstMatch
        guard fiveMinutes.exists else {
            XCTFail("The five-minute Auto-Lock option is not available")
            app.activate()
            return
        }
        fiveMinutes.tap()
        let back = settings.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.waitForExistence(timeout: 5), "Auto-Lock screen did not expose its back button")
        back.tap()
        let updatedCell = settings.cells["AUTOLOCK"]
        XCTAssertTrue(updatedCell.waitForExistence(timeout: 5), "Could not return to the Auto-Lock summary cell")
        let updated = "label=\(updatedCell.label); value=\(String(describing: updatedCell.value))"
        print("AUTO_LOCK_RESTORED \(updated)")
        XCTAssertTrue(
            updated.contains("5 分钟") || updated.contains("5分钟") || updated.localizedCaseInsensitiveContains("5 Minutes"),
            "Auto-Lock summary did not return to five minutes"
        )
        let screenshot = XCTAttachment(screenshot: settings.screenshot())
        screenshot.name = "auto-lock-restored-to-five-minutes"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.activate()
        #endif
    }

    func testSelectImageVideoAndSend() {
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        dismissKeyboardIfNeeded()
        button(containing: "照片").tap()
        XCTAssertNotNil(firstExistingButton(labels: ["取消", "Cancel"], timeout: 10))
        // Only the two dedicated fixtures imported at 21:46; never choose user media.
        let image = app.images.matching(NSPredicate(format: "identifier == %@ AND label BEGINSWITH %@ AND label CONTAINS %@", "PXGGridLayout-Info", "照片", "21:46")).firstMatch
        let video = app.images.matching(NSPredicate(format: "identifier == %@ AND label BEGINSWITH %@ AND label CONTAINS %@", "PXGGridLayout-Info", "视频", "21:46")).firstMatch
        XCTAssertTrue(image.waitForExistence(timeout: 15))
        XCTAssertTrue(video.exists)
        // Photos exposes these thumbnails as AX images without a hittable point.
        // Touch their verified frames; keep selection constrained to fixture labels.
        let imageFrame = image.frame
        let videoFrame = video.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: imageFrame.midX, dy: imageFrame.midY)).tap()
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: videoFrame.midX, dy: videoFrame.midY)).tap()
        XCTAssertTrue(app.buttons["完成"].isEnabled)
        app.buttons["完成"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "移除附件").count, 2)
        app.buttons["发送"].tap()
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
        attachScreenshot(named: "image-video-sent")
    }

    func testSignedInSupabaseShellAndNavigation() throws {
        XCTAssertTrue(button(containing: "切换 Supabase 存储空间").waitForExistence(timeout: 10))
        XCTAssertTrue(button(containing: "存储空间，已同步").exists)
        XCTAssertTrue(app.staticTexts["消息"].exists)
        XCTAssertFalse(app.staticTexts["WebDAV"].exists)

        button(containing: "标记").tap()
        XCTAssertTrue(app.staticTexts["稍后处理"].waitForExistence(timeout: 5))

        app.buttons["我的"].tap()
        XCTAssertTrue(app.staticTexts["已登录"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["云端与存储"].exists)
        XCTAssertTrue(button(containing: "附件缓存").exists)
        XCTAssertTrue(button(containing: "关于 Transfer Genie").exists)
        XCTAssertTrue(app.buttons["退出登录"].exists)
        XCTAssertFalse(app.staticTexts["Telegram"].exists)
        XCTAssertFalse(app.staticTexts["本地 HTTP API"].exists)

        app.buttons["消息"].tap()
        XCTAssertTrue(app.staticTexts["消息"].waitForExistence(timeout: 5))
        attachScreenshot(named: "signed-in-supabase-shell")
    }

    func testDraftImagePreviewAndRemoval() throws {
        app.buttons["新消息"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let original = editor.value as? String ?? ""
        guard (original.isEmpty || original.hasPrefix("输入文字")), app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Preserve the existing draft before selecting the dedicated image fixture")
        }
        defer {
            if let done = firstExistingButton(labels: ["完成", "Done", "关闭", "Close"], timeout: 1), done.exists { done.tap() }
            app.activate()
            if button(containing: "预览附件 TG-IOS-PROBE-20261026-image").exists,
               app.buttons.matching(identifier: "移除附件").count == 1 {
                app.buttons["移除附件"].tap()
            }
            if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() }
        }
        dismissKeyboardIfNeeded()
        button(containing: "照片").tap()
        let image = app.images.matching(NSPredicate(format: "identifier == %@ AND label BEGINSWITH %@ AND label CONTAINS %@", "PXGGridLayout-Info", "照片", "21:46")).firstMatch
        XCTAssertTrue(image.waitForExistence(timeout: 15))
        let imageFrame = image.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: imageFrame.midX, dy: imageFrame.midY)).tap()
        app.buttons["完成"].tap()
        let preview = button(containing: "预览附件 TG-IOS-PROBE-20261026-image")
        XCTAssertTrue(preview.waitForExistence(timeout: 15))
        XCTAssertTrue(preview.isHittable)
        preview.tap()
        // Quick Look opens images with chrome hidden; tap the image to reveal it.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let done = firstExistingButton(labels: ["完成", "Done", "关闭", "Close"], timeout: 15)
        XCTAssertNotNil(done, "System Quick Look did not present a dismiss control")
        attachScreenshot(named: "draft-image-system-preview")
        done?.tap()
        XCTAssertTrue(app.buttons["移除附件"].waitForExistence(timeout: 5))
        app.buttons["移除附件"].tap()
        XCTAssertFalse(app.buttons["移除附件"].exists)
        app.buttons["关闭新消息"].tap()
    }

    func testDraftDocumentPreviewAndRemoval() throws {
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        let original = composerEditor().value as? String ?? ""
        guard (original.isEmpty || original.hasPrefix("输入文字")), app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Preserve the existing draft before selecting the dedicated document fixture")
        }
        defer {
            if let done = firstExistingButton(labels: ["完成", "Done"], timeout: 1), done.exists { done.tap() }
            app.activate()
            if button(containing: "预览附件 TG-IOS-PROBE-20261027-document.txt").exists,
               app.buttons.matching(identifier: "移除附件").count == 1 {
                app.buttons["移除附件"].tap()
            }
            if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() }
        }
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        var fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document")).firstMatch
        if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
            browse.tap()
            fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document")).firstMatch
        }
        XCTAssertTrue(fixture.waitForExistence(timeout: 15), "Dedicated document fixture is not visible in Files")
        fixture.tap()
        let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
        XCTAssertNotNil(open, "Document picker did not expose its selection confirmation")
        open?.tap()
        let preview = button(containing: "预览附件 TG-IOS-PROBE-20261027-document.txt")
        XCTAssertTrue(preview.waitForExistence(timeout: 15))
        preview.tap()
        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 15)
        XCTAssertNotNil(done, "Text Quick Look did not provide a dismiss control")
        attachScreenshot(named: "draft-document-system-preview")
        done?.tap()
        XCTAssertTrue(app.buttons["移除附件"].waitForExistence(timeout: 5))
        app.buttons["移除附件"].tap()
        XCTAssertFalse(app.buttons["移除附件"].exists)
        app.buttons["关闭新消息"].tap()
    }

    func testUnsentDocumentDraftSurvivesTermination() throws {
        let fixtureName = "TG-IOS-PROBE-20261027-document.txt"
        app.buttons["新消息"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let initial = editor.value as? String ?? ""
        guard (initial.isEmpty || initial.hasPrefix("输入文字")), app.buttons.matching(identifier: "移除附件").count == 0 else {
            throw XCTSkip("Preserve an existing unsent draft")
        }
        defer {
            if app.buttons["新消息"].exists { app.buttons["新消息"].tap() }
            if button(containing: "预览附件 " + fixtureName).exists, app.buttons.matching(identifier: "移除附件").count == 1 {
                app.buttons["移除附件"].tap()
            }
            if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() }
        }
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        var fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document")).firstMatch
        if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
            browse.tap()
            fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document")).firstMatch
        }
        XCTAssertTrue(fixture.waitForExistence(timeout: 15))
        fixture.tap()
        XCTAssertNotNil(firstExistingButton(labels: ["打开", "Open"], timeout: 5))
        firstExistingButton(labels: ["打开", "Open"], timeout: 2)?.tap()
        XCTAssertTrue(button(containing: "预览附件 " + fixtureName).waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["草稿已自动保存"].waitForExistence(timeout: 10))
        app.buttons["关闭新消息"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        let restored = button(containing: "预览附件 " + fixtureName)
        XCTAssertTrue(restored.waitForExistence(timeout: 10), "The unsent sandbox attachment must survive termination")
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原文件已不可用")).firstMatch.exists)
        restored.tap()
        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 15)
        XCTAssertNotNil(done, "Restored attachment remains readable by Quick Look")
        done?.tap()
        attachScreenshot(named: "restored-unsent-document")
    }

    func testDocumentSendRemoveCacheAndRedownloadPreview() {
        let fixtureName = "TG-IOS-PROBE-20261027-document.txt"
        var fixtureMessage = app.staticTexts[fixtureName].firstMatch
        if !fixtureMessage.waitForExistence(timeout: 3) {
            app.buttons["新消息"].tap()
            XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
            dismissKeyboardIfNeeded()
            button(containing: "文件").tap()

            var fixture = app.descendants(matching: .any)
                .matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document"))
                .firstMatch
            if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
                browse.tap()
                fixture = app.descendants(matching: .any)
                    .matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document"))
                    .firstMatch
            }
            XCTAssertTrue(fixture.waitForExistence(timeout: 15))
            fixture.tap()
            let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
            XCTAssertNotNil(open)
            open?.tap()
            XCTAssertTrue(button(containing: "预览附件 \(fixtureName)").waitForExistence(timeout: 15))
            app.buttons["发送"].tap()
            XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
            fixtureMessage = app.staticTexts[fixtureName].firstMatch
            XCTAssertTrue(fixtureMessage.waitForExistence(timeout: 20), "Sent document did not appear in the feed")
        }

        fixtureMessage.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        app.buttons["更多"].tap()
        let removeCache = button(containing: "仅移除本地附件缓存")
        XCTAssertTrue(removeCache.waitForExistence(timeout: 5))
        removeCache.tap()

        fixtureMessage = app.staticTexts[fixtureName].firstMatch
        XCTAssertTrue(fixtureMessage.waitForExistence(timeout: 10))
        fixtureMessage.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "按需下载")).firstMatch.waitForExistence(timeout: 5))
        app.buttons["系统预览"].tap()

        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 60)
        XCTAssertNotNil(done, "Downloaded document did not open in Quick Look")
        attachScreenshot(named: "downloaded-document-system-preview")
        done?.tap()
        // System banners can briefly steal the accessibility session as Quick Look
        // dismisses on a physical device. Re-activate before querying the WebView.
        app.activate()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 10))
        app.buttons["关闭详情"].tap()
    }

    func testSentFixtureShareCanBeCancelled() {
        let fixtureName = "TG-IOS-PROBE-20261026-image.jpeg"
        let fixture = app.staticTexts[fixtureName]
        XCTAssertTrue(fixture.waitForExistence(timeout: 15), "Dedicated sent image fixture is not visible in the feed")
        fixture.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))

        let share = app.buttons["分享"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        XCTAssertTrue(share.isHittable)
        share.tap()

        let shareAction = firstExistingElement(labels: ["Copy", "拷贝", "提醒事项", "Reminders"], timeout: 60)
        XCTAssertNotNil(shareAction, "The system share sheet did not expose an activity")
        attachScreenshot(named: "sent-image-system-share")
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.98))
        start.press(forDuration: 0.1, thenDragTo: end)

        XCTAssertTrue(waitForNonExistence(shareAction!, timeout: 10), "The system share sheet did not dismiss")
        XCTAssertTrue(app.buttons["关闭详情"].isHittable, "Cancelling sharing did not return to message details")
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Sharing failed")).firstMatch.exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "分享失败")).firstMatch.exists)
        app.buttons["关闭详情"].tap()
    }

    func testVideoPlaysInsideDetail() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261026-video.mp4")
        let fixture = app.staticTexts["TG-IOS-PROBE-20261026-video.mp4"].firstMatch
        XCTAssertTrue(fixture.waitForExistence(timeout: 15))
        dismissSearchKeyboard()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "查看详情").tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        let play = app.buttons["播放视频"]
        XCTAssertTrue(play.waitForExistence(timeout: 5))
        play.tap()
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "inline-video-accessibility"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
        attachScreenshot(named: "inline-video-before-control-check")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "已播放 [1-9][0-9]* 秒")).firstMatch.waitForExistence(timeout: 30), "Real video playback time did not advance")
        XCTAssertTrue(app.buttons["关闭详情"].exists, "Playback must retain message detail")
        XCTAssertNil(firstExistingButton(labels: ["完成", "Done"], timeout: 1))
        attachScreenshot(named: "video-playing-inside-detail")
        app.buttons["关闭详情"].tap()
    }

    func testImageThumbnailAndOriginalView() {
        let name = "TG-IOS-PROBE-20261026-image.jpeg"
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(name)
        XCTAssertTrue(app.images[name].firstMatch.waitForExistence(timeout: 20), "Feed thumbnail is missing")
        dismissSearchKeyboard()
        attachScreenshot(named: "image-thumbnail-in-feed")
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "查看详情").tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["查看"].waitForExistence(timeout: 10))
        attachScreenshot(named: "image-thumbnail-in-detail")
        app.buttons["查看"].tap()
        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 30)
        XCTAssertNotNil(done)
        attachScreenshot(named: "image-original-system-preview")
        done?.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 10), "Quick Look did not return to image details")
        app.buttons["关闭详情"].tap()
    }

    func testReleaseImageOfflineFailureThenRedownloadsAndRestoresCache() {
        let fixtureName = "TG-IOS-PROBE-20261026-image.jpeg"
        defer {
            app.terminate()
            app.launchEnvironment = [:]
            app.launch()
        }

        func openFixtureFromSearch() {
            app.buttons["搜索消息"].tap()
            let search = app.searchFields["搜索文本、文件名"]
            XCTAssertTrue(search.waitForExistence(timeout: 5))
            search.tap()
            search.typeText(fixtureName)
            XCTAssertTrue(app.staticTexts[fixtureName].firstMatch.waitForExistence(timeout: 20))
            XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1, "Only the dedicated image fixture may be changed")
            dismissSearchKeyboard()
        }

        openFixtureFromSearch()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "仅移除本地附件缓存").tap()
        XCTAssertTrue(app.staticTexts[fixtureName].firstMatch.waitForExistence(timeout: 10))

        app.terminate()
        app.launchEnvironment = [
            "HTTP_PROXY": "http://127.0.0.1:17991",
            "HTTPS_PROXY": "http://127.0.0.1:17991",
            "ALL_PROXY": "http://127.0.0.1:17991",
            "NO_PROXY": "",
            "no_proxy": "",
        ]
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        openFixtureFromSearch()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "查看详情").tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        let onDemand = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "按需下载")).firstMatch
        let recoveredCache = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原件已缓存")).firstMatch
        let recovered = NSPredicate { _, _ in onDemand.exists || recoveredCache.exists }
        XCTAssertEqual(
            XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: recovered, object: nil)], timeout: 10),
            .completed,
            "The original must remain on-demand or recover automatically after connectivity returns"
        )
        app.buttons["查看"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "打开失败，可重试")).firstMatch.waitForExistence(timeout: 30))
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原件已缓存")).firstMatch.exists)
        attachScreenshot(named: "release-image-offline-open-failed-recoverably")

        app.terminate()
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 90))
        openFixtureFromSearch()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "查看详情").tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        let restoredOnDemand = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "按需下载")).firstMatch
        let restoredAutomatically = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原件已缓存")).firstMatch
        let restoredState = NSPredicate { _, _ in restoredOnDemand.exists || restoredAutomatically.exists }
        XCTAssertEqual(
            XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: restoredState, object: nil)], timeout: 10),
            .completed,
            "The original must remain on-demand or recover automatically after connectivity returns"
        )
        app.buttons["查看"].tap()
        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 60)
        XCTAssertNotNil(done, "The dedicated image did not redownload into the app sandbox")
        done?.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原件已缓存")).firstMatch.waitForExistence(timeout: 10))
        attachScreenshot(named: "release-image-redownloaded-and-cache-restored")
        app.buttons["关闭详情"].tap()
    }

    func testSentFixtureVideoProvidesPlaybackControls() {
        let fixtureName = "TG-IOS-PROBE-20261026-video.mp4"
        let fixture = app.staticTexts[fixtureName]
        XCTAssertTrue(fixture.waitForExistence(timeout: 15), "Dedicated sent video fixture is not visible in the feed")
        fixture.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))

        let openPlayback = app.buttons["系统播放器"]
        XCTAssertTrue(openPlayback.waitForExistence(timeout: 5))
        XCTAssertTrue(openPlayback.isHittable)
        openPlayback.tap()

        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 60)
        XCTAssertNotNil(done, "System video player did not present")
        var playbackControl = firstExistingElement(
            labels: ["Pause", "暂停", "Play", "播放", "Playback position", "播放位置"],
            timeout: 2
        )
        if playbackControl == nil {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            playbackControl = firstExistingElement(
                labels: ["Pause", "暂停", "Play", "播放", "Playback position", "播放位置"],
                timeout: 15
            )
        }
        XCTAssertNotNil(playbackControl, "The system player did not expose playback controls")
        XCTAssertTrue(playbackControl?.isHittable == true, "The system playback control is not interactive")
        attachScreenshot(named: "sent-video-system-playback")
        done?.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 10))
        app.buttons["关闭详情"].tap()
    }

    func testRepeatedPreviewAndPlaybackSessionsRemainResponsive() {
        let documentName = "TG-IOS-PROBE-20261027-document.txt"
        let videoName = "TG-IOS-PROBE-20261026-video.mp4"

        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(documentName)
        XCTAssertTrue(app.staticTexts[documentName].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        app.staticTexts.matching(identifier: documentName).allElementsBoundByIndex.last!.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))

        for cycle in 1...10 {
            let preview = app.buttons["系统预览"]
            XCTAssertTrue(preview.isHittable, "Quick Look trigger was not responsive on cycle \(cycle)")
            preview.tap()
            let done = firstExistingButton(labels: ["完成", "Done"], timeout: 20)
            XCTAssertNotNil(done, "Quick Look did not present on cycle \(cycle)")
            done?.tap()
            XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 10), "Quick Look did not return to details on cycle \(cycle)")
            print("Repeated Quick Look completed: \(cycle)/10")
        }
        app.buttons["关闭详情"].tap()
        app.buttons["清除"].tap()

        let videoSearch = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(videoSearch.waitForExistence(timeout: 5))
        videoSearch.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        videoSearch.typeText(videoName)
        var videoResult = app.staticTexts[videoName].firstMatch
        XCTAssertTrue(videoResult.waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        dismissSearchKeyboard()
        videoResult = app.staticTexts[videoName].firstMatch
        XCTAssertTrue(videoResult.waitForExistence(timeout: 5))
        let videoMenu = app.buttons["更多操作"].firstMatch
        XCTAssertTrue(videoMenu.isHittable, "The unique video result did not expose its touch action")
        videoMenu.tap()
        let viewDetails = button(containing: "查看详情")
        XCTAssertTrue(viewDetails.waitForExistence(timeout: 5))
        XCTAssertTrue(viewDetails.isHittable)
        viewDetails.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))

        for cycle in 1...10 {
            let playback = app.buttons["系统播放器"]
            XCTAssertTrue(playback.isHittable, "Playback trigger was not responsive on cycle \(cycle)")
            playback.tap()
            let done = firstExistingButton(labels: ["完成", "Done"], timeout: 20)
            XCTAssertNotNil(done, "System player did not present on cycle \(cycle)")
            var playbackControl = firstExistingElement(
                labels: ["Pause", "暂停", "Play", "播放", "Playback position", "播放位置"],
                timeout: 2
            )
            if playbackControl == nil {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                playbackControl = firstExistingElement(
                    labels: ["Pause", "暂停", "Play", "播放", "Playback position", "播放位置"],
                    timeout: 10
                )
            }
            XCTAssertNotNil(playbackControl, "Playback controls disappeared on cycle \(cycle)")
            done?.tap()
            XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 10), "System player did not return to details on cycle \(cycle)")
            print("Repeated AVPlayer session completed: \(cycle)/10")
        }
        app.buttons["关闭详情"].tap()
        app.buttons["清除"].tap()
        XCTAssertTrue(app.buttons["新消息"].isHittable)
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        attachScreenshot(named: "repeated-preview-playback-remains-responsive")
    }

    func testInjectedConflictCanAdoptRemoteDeletion() {
        app.buttons["我的"].tap()
        let conflictEntry = button(containing: "项需要选择保留版本")
        XCTAssertTrue(conflictEntry.waitForExistence(timeout: 15), "Injected conflict did not appear in account settings")
        conflictEntry.tap()

        XCTAssertTrue(app.staticTexts["同步冲突"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["TG-IOS-PROBE-CONFLICT-LOCAL"].exists)
        XCTAssertTrue(app.staticTexts["该版本已被删除"].exists)
        let adoptRemote = app.buttons["采用云端"]
        XCTAssertTrue(adoptRemote.isHittable)
        adoptRemote.tap()

        XCTAssertTrue(app.staticTexts["当前没有待处理冲突。"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["TG-IOS-PROBE-CONFLICT-LOCAL"].exists)
        app.buttons["关闭同步冲突"].tap()
        XCTAssertFalse(button(containing: "项需要选择保留版本").exists)
        app.buttons["消息"].tap()
    }

    func testAboutAndSenderSettingsAreReachable() {
        app.buttons["我的"].tap()
        button(containing: "关于 Transfer Genie").tap()
        XCTAssertTrue(app.buttons["关闭关于"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["同步服务"].exists)
        XCTAssertTrue(app.staticTexts["Supabase"].exists)
        app.buttons["关闭关于"].tap()
        button(containing: "发送者名称").tap()
        let editor = app.textFields["发送者名称"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertFalse((editor.value as? String ?? "").isEmpty)
        XCTAssertTrue(app.buttons["保存名称"].exists)
        app.buttons["关闭发送者名称"].tap()
        XCTAssertFalse(editor.exists)
        app.buttons["消息"].tap()
    }

    func testNativePluginDiagnosticIsVisible() {
        app.buttons["我的"].tap()
        button(containing: "关于 Transfer Genie").tap()
        XCTAssertTrue(app.staticTexts["原生桥接"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["ios · native=true · main-thread=true"].waitForExistence(timeout: 10),
            "The installed app did not report the expected native iOS main-thread bridge"
        )
        attachScreenshot(named: "native-plugin-diagnostic")
        app.buttons["关闭关于"].tap()
        app.buttons["消息"].tap()
    }

    func testMarkedMetadataEditorIsReachable() {
        button(containing: "标记").tap()
        let edit = button(containing: "编辑标记")
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        XCTAssertTrue(edit.isHittable)
        edit.tap()
        XCTAssertTrue(app.staticTexts["标记设置"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "截止日期")).firstMatch.exists)
        XCTAssertTrue(app.buttons["保存标记"].exists)
        XCTAssertTrue(app.textFields["新标签名称"].exists)
        app.buttons["关闭编辑标记"].tap()
        app.buttons["消息"].tap()
    }

    func testCompactSyncStatusInSpaceSelector() {
        let selector = button(containing: "存储空间，已同步")
        XCTAssertTrue(selector.waitForExistence(timeout: 30))
        XCTAssertLessThanOrEqual(selector.frame.height, 52, "Sync status must fit inside the compact Space selector")
        XCTAssertFalse(button(containing: "本机与云端已同步").exists)
        selector.tap()
        XCTAssertTrue(app.staticTexts["选择存储空间"].waitForExistence(timeout: 5))
        app.buttons["关闭存储空间选择"].tap()

        app.buttons["我的"].tap()
        button(containing: "同步与传输").tap()
        XCTAssertTrue(app.buttons["关闭同步与传输"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["本机与云端已同步"].exists)
        XCTAssertFalse(app.staticTexts["正在与 Supabase 同步"].exists)
        app.buttons["关闭同步与传输"].tap()
        app.buttons["消息"].tap()
    }

    func testLargeAccessibilityTextKeepsPrimaryActionsReachable() {
        let space = button(containing: "切换 Supabase 存储空间")
        XCTAssertTrue(space.waitForExistence(timeout: 30))
        XCTAssertTrue(space.isHittable)
        XCTAssertGreaterThanOrEqual(space.frame.height, 44)

        for label in ["消息", "标记", "我的"] {
            let tab = app.buttons[label]
            XCTAssertTrue(tab.exists, "Missing primary navigation item: \(label)")
            XCTAssertTrue(tab.isHittable, "Primary navigation is not reachable with large text: \(label)")
            XCTAssertGreaterThanOrEqual(tab.frame.height, 44)
        }

        let search = app.buttons["搜索消息"]
        XCTAssertTrue(search.isHittable)
        XCTAssertGreaterThanOrEqual(search.frame.width, 44)
        XCTAssertGreaterThanOrEqual(search.frame.height, 44)

        let launcher = app.buttons["新消息"]
        XCTAssertTrue(launcher.isHittable)
        XCTAssertGreaterThanOrEqual(launcher.frame.height, 44)
        launcher.tap()

        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertTrue(editor.isHittable)
        let photo = button(containing: "照片")
        let file = button(containing: "文件")
        attachScreenshot(named: "accessibility-composer-before-reachability")
        XCTAssertTrue(app.buttons["关闭新消息"].isHittable)
        XCTAssertTrue(photo.isHittable)
        XCTAssertTrue(file.isHittable)
        XCTAssertGreaterThanOrEqual(app.buttons["关闭新消息"].frame.height, 44)
        XCTAssertGreaterThanOrEqual(photo.frame.height, 44)
        XCTAssertGreaterThanOrEqual(file.frame.height, 44)
        attachScreenshot(named: "accessibility-extra-extra-large-primary-actions")
        app.buttons["关闭新消息"].tap()
        XCTAssertTrue(launcher.waitForExistence(timeout: 5))
        XCTAssertTrue(launcher.isHittable)
    }

    // Run only with simctl content_size=accessibility-extra-extra-extra-large.
    // The text frame proves that the installed WebView has scaled, not just UIKit settings.
    func testAccessibilityCategoryActuallyScalesWebText() {
        app.buttons["我的"].tap()
        button(containing: "关于 Transfer Genie").tap()
        let platform = app.staticTexts["平台"]
        XCTAssertTrue(platform.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(platform.frame.height, 35, "The fixed 13px label must follow the actual accessibility text category")
        XCTAssertTrue(app.buttons["关闭关于"].isHittable)
        attachScreenshot(named: "dynamic-type-actual-web-text")
        app.buttons["关闭关于"].tap()
        app.buttons["消息"].tap()
    }

    // The host harness changes simctl content_size after each readiness marker.
    func testSystemTextChangeUpdatesRunningWebView() {
        app.buttons["我的"].tap()
        button(containing: "关于 Transfer Genie").tap()
        let platform = app.staticTexts["平台"]
        XCTAssertTrue(platform.waitForExistence(timeout: 5))
        XCTAssertLessThan(platform.frame.height, 25)
        print("SYSTEM_TEXT_BASELINE_READY")
        let enlarged = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in platform.frame.height > 35 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [enlarged], timeout: 25), .completed, "Running WebView must respond to system size changes")
        attachScreenshot(named: "running-webview-text-enlarged")
        print("SYSTEM_TEXT_ENLARGED_READY")
        let restored = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in platform.frame.height < 25 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 25), .completed, "Running WebView must restore normal system size")
        app.buttons["关闭关于"].tap()
        app.buttons["消息"].tap()
    }

    func testSearchFindsDedicatedDocumentAndClears() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        XCTAssertTrue(app.staticTexts["TG-IOS-PROBE-20261027-document.txt"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["搜索当前空间已同步到本机的消息"].exists)
        app.buttons["清除"].tap()
        let cleared = NSPredicate(format: "exists == false")
        expectation(for: cleared, evaluatedWith: app.staticTexts["搜索当前空间已同步到本机的消息"])
        waitForExpectations(timeout: 5)
        XCTAssertTrue(app.buttons["更多操作"].firstMatch.exists)
        attachScreenshot(named: "search-cleared")
    }

    func testCopyDedicatedDocumentName() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        XCTAssertTrue(app.staticTexts["TG-IOS-PROBE-20261027-document.txt"].waitForExistence(timeout: 15))
        app.buttons["更多操作"].firstMatch.tap()
        let copy = button(containing: "复制")
        XCTAssertTrue(copy.waitForExistence(timeout: 5))
        copy.tap()
        XCTAssertTrue(waitForNonExistence(copy, timeout: 5), "Successful copy must close the action sheet")
        XCTAssertTrue(app.buttons["新消息"].exists)
    }

    func testDedicatedDocumentMarkAndDeleteCancellation() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        let document = app.staticTexts["TG-IOS-PROBE-20261027-document.txt"]
        XCTAssertTrue(document.waitForExistence(timeout: 15))
        dismissSearchKeyboard()
        app.buttons["更多操作"].firstMatch.tap()
        XCTAssertTrue(button(containing: "复制").waitForExistence(timeout: 5))
        let wasMarked = button(containing: "取消标记").exists
        let markAction = button(containing: wasMarked ? "编辑标签与截止日期" : "☆ 标记")
        XCTAssertTrue(markAction.waitForExistence(timeout: 5))
        markAction.tap()
        XCTAssertTrue(app.staticTexts["标记设置"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["保存标记"].exists)
        app.buttons["关闭编辑标记"].tap()
        XCTAssertTrue(button(containing: "复制").waitForExistence(timeout: 5))
        XCTAssertEqual(button(containing: "取消标记").exists, wasMarked, "Cancelling mark settings must retain the fixture's original state")
        if wasMarked {
            button(containing: "取消标记").tap()
            XCTAssertTrue(app.buttons["确认取消标记"].waitForExistence(timeout: 5))
            app.buttons["保留标记"].tap()
            XCTAssertTrue(button(containing: "取消标记").waitForExistence(timeout: 5))
        }
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.staticTexts["删除消息"].waitForExistence(timeout: 5), "Cloud deletion must show explicit confirmation")
        XCTAssertTrue(app.buttons["确认删除"].exists)
        let cancel = app.buttons.matching(identifier: "取消删除").allElementsBoundByIndex.last!
        XCTAssertTrue(cancel.isHittable, "Cloud deletion must provide a confirmation cancellation path")
        cancel.tap()
        XCTAssertTrue(button(containing: "复制").exists)
        XCTAssertTrue(document.exists)
        attachScreenshot(named: "single-delete-cancelled")
        app.buttons["取消"].tap()
        app.buttons["清除"].tap()
    }

    func testCacheClearCanBeCancelledWithoutMutation() {
        app.buttons["我的"].tap()
        button(containing: "附件缓存").tap()
        let release = button(containing: "释放")
        XCTAssertTrue(release.waitForExistence(timeout: 5))
        let originalLabel = release.label
        release.tap()
        XCTAssertTrue(app.buttons["确认清理缓存"].waitForExistence(timeout: 5))
        app.buttons["取消清理"].tap()
        XCTAssertFalse(app.buttons["确认清理缓存"].exists)
        XCTAssertEqual(button(containing: "释放").label, originalLabel)
        app.buttons["关闭缓存管理"].tap()
        app.buttons["消息"].tap()
    }

    func testDedicatedSelectionDeletionCanBeCancelled() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        let document = app.staticTexts["TG-IOS-PROBE-20261027-document.txt"]
        XCTAssertTrue(document.waitForExistence(timeout: 15))
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "多选").tap()
        XCTAssertTrue(app.staticTexts["已选择 1 条"].waitForExistence(timeout: 5))
        app.buttons["删除"].tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "取消删除").allElementsBoundByIndex.last!.tap()
        XCTAssertFalse(app.buttons["确认删除"].exists)
        XCTAssertTrue(document.exists)
        XCTAssertTrue(app.staticTexts["已选择 1 条"].exists)
        app.buttons["取消"].tap()
        XCTAssertTrue(app.buttons["新消息"].exists)
    }

    func testDedicatedBatchMarkUnmarkAndConfirmedDeletion() throws {
        let prefix = "TG-IOS-BATCH-" + UUID().uuidString
        let probes = [prefix + "-A", prefix + "-B"]
        app.buttons["新消息"].tap()
        let existingDraft = composerEditor()
        XCTAssertTrue(existingDraft.waitForExistence(timeout: 5))
        let original = existingDraft.value as? String ?? ""
        guard (original.isEmpty || original.hasPrefix("输入文字")), app.buttons.matching(identifier: "移除附件").count == 0 else {
            app.buttons["关闭新消息"].tap()
            throw XCTSkip("Preserve an existing unsent draft before creating batch fixtures")
        }
        app.buttons["关闭新消息"].tap()
        print("Dedicated batch fixture prefix: \(prefix)")
        for probe in probes {
            app.buttons["新消息"].tap()
            let editor = composerEditor()
            XCTAssertTrue(editor.waitForExistence(timeout: 5))
            editor.tap()
            editor.typeText(probe)
            dismissKeyboardIfNeeded()
            app.buttons["发送"].tap()
            XCTAssertTrue(app.staticTexts[probe].waitForExistence(timeout: 20))
            XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        }
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(prefix)
        XCTAssertTrue(app.staticTexts[probes[0]].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts[probes[1]].exists)
        dismissSearchKeyboard()

        func selectOnlyProbes() {
            // Never permit a destructive batch unless the unique search has exactly these rows.
            XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 2)
            for probe in probes { XCTAssertTrue(app.staticTexts[probe].exists) }
            app.buttons["更多操作"].firstMatch.tap()
            XCTAssertTrue(button(containing: "多选").waitForExistence(timeout: 5))
            button(containing: "多选").tap()
            let first = app.descendants(matching: .any).matching(identifier: "选择消息 " + probes[0]).firstMatch
            let second = app.descendants(matching: .any).matching(identifier: "选择消息 " + probes[1]).firstMatch
            XCTAssertTrue(first.waitForExistence(timeout: 5))
            XCTAssertTrue(second.exists)
            XCTAssertTrue(app.staticTexts["已选择 1 条"].exists)
            second.tap()
            XCTAssertTrue(app.staticTexts["已选择 2 条"].waitForExistence(timeout: 5))
            XCTAssertEqual(app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "选择消息 " + prefix)).count, 2)
        }

        func verifyMarkAction(_ expected: String) {
            for index in 0..<2 {
                app.buttons.matching(identifier: "更多操作").element(boundBy: index).tap()
                XCTAssertTrue(button(containing: expected).waitForExistence(timeout: 5))
                app.buttons["取消"].tap()
            }
        }

        selectOnlyProbes()
        let batchToolbar = app.otherElements["消息批量操作"]
        XCTAssertTrue(batchToolbar.waitForExistence(timeout: 5))
        batchToolbar.buttons["标记"].tap()
        XCTAssertTrue(app.staticTexts["标记设置"].waitForExistence(timeout: 5))
        app.buttons["保存标记"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 15))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        verifyMarkAction("取消标记")
        attachScreenshot(named: "dedicated-batch-marked")

        selectOnlyProbes()
        batchToolbar.buttons["取消标记"].tap()
        XCTAssertTrue(app.buttons["确认取消标记"].waitForExistence(timeout: 5))
        app.buttons["确认取消标记"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 15))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        verifyMarkAction("☆ 标记")

        selectOnlyProbes()
        app.buttons["删除"].tap()
        XCTAssertTrue(app.staticTexts["删除选中的 2 条消息？ 删除将同步到云端，其他设备也会移除这些消息。"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        for probe in probes { XCTAssertFalse(app.staticTexts[probe].exists) }
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        attachScreenshot(named: "dedicated-batch-deleted")
    }

    func testMessageMultiSelectionCanBeCancelledWithoutMutation() {
        XCTAssertTrue(app.buttons["更多操作"].firstMatch.waitForExistence(timeout: 10))
        guard let more = app.buttons.matching(identifier: "更多操作").allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            XCTFail("No visible message action entry")
            return
        }
        more.tap()
        let multiple = button(containing: "多选")
        XCTAssertTrue(multiple.waitForExistence(timeout: 5))
        multiple.tap()
        XCTAssertTrue(app.staticTexts["已选择 1 条"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["删除"].exists)
        XCTAssertFalse(app.buttons["新消息"].exists)
        attachScreenshot(named: "message-multi-selection")
        app.buttons["取消"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["删除"].exists)
    }

    func testLongPressEntersSelectionAndCanBeCancelledWithoutMutation() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        let document = app.staticTexts["TG-IOS-PROBE-20261027-document.txt"]
        XCTAssertTrue(document.waitForExistence(timeout: 15))
        document.press(forDuration: 0.7)
        XCTAssertTrue(app.staticTexts["已选择 1 条"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["删除"].exists)
        XCTAssertFalse(app.buttons["新消息"].exists)
        attachScreenshot(named: "physical-long-press-selection")
        app.buttons["取消"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
        XCTAssertTrue(document.exists)
        XCTAssertFalse(app.buttons["删除"].exists)
    }

    func testCompactStatusAndLongMessageExpansion() throws {
        XCTAssertTrue(button(containing: "切换 Supabase 存储空间").exists)
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 20))
        XCTAssertFalse(button(containing: "本机与云端已同步").exists)
        let expand = button(containing: "展开更多")
        XCTAssertTrue(expand.waitForExistence(timeout: 10))
        expand.tap()
        let collapse = button(containing: "收起")
        XCTAssertTrue(collapse.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["关闭详情"].exists)
        collapse.tap()
        XCTAssertTrue(button(containing: "展开更多").exists)
        attachScreenshot(named: "compact-status-and-collapsed-message")
    }

    func testSpaceTransferAndCacheSheetsAreReachable() throws {
        button(containing: "切换 Supabase 存储空间").tap()
        XCTAssertTrue(app.staticTexts["选择存储空间"].waitForExistence(timeout: 5))
        XCTAssertTrue(button(containing: "BK100-33（WG）").exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "移动端不会自动创建")).firstMatch.exists)
        app.buttons["关闭存储空间选择"].tap()

        app.buttons["我的"].tap()
        let syncEntry = button(containing: "同步与传输")
        XCTAssertTrue(syncEntry.waitForExistence(timeout: 5))
        syncEntry.tap()
        XCTAssertTrue(app.staticTexts["同步与传输"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["立即同步"].exists)
        app.buttons["关闭同步与传输"].tap()

        app.buttons["我的"].tap()
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "附件缓存")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["可安全释放"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "待上传原件")).firstMatch.exists)
        app.buttons["关闭缓存管理"].tap()
    }

    func testComposerKeyboardAndPickerCancellation() throws {
        app.buttons["新消息"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertTrue(editor.isHittable)
        editor.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(button(containing: "照片").isHittable, "Attachment actions must stay below the keyboard")
        XCTAssertFalse(button(containing: "文件").isHittable, "Attachment actions must stay below the keyboard")
        XCTAssertFalse(button(containing: "标记").isHittable, "Mark settings must stay below the keyboard")
        XCTAssertFalse(app.buttons["发送"].isHittable, "Send must stay below the keyboard")

        dismissKeyboardIfNeeded()
        XCTAssertTrue(button(containing: "照片").waitForExistence(timeout: 5))
        XCTAssertTrue(button(containing: "照片").isHittable)
        XCTAssertTrue(button(containing: "文件").isHittable)
        XCTAssertTrue(button(containing: "标记").isHittable)
        button(containing: "照片").tap()
        let cancel = firstExistingButton(labels: ["取消", "Cancel"], timeout: 10)
        XCTAssertNotNil(cancel, "The native photo picker did not provide a cancellation path")
        cancel?.tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 10))

        button(containing: "文件").tap()
        let documentCancel = firstExistingButton(labels: ["取消", "Cancel"], timeout: 10)
        XCTAssertNotNil(documentCancel, "The native document picker did not provide a cancellation path")
        documentCancel?.tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 10))
        app.buttons["关闭新消息"].tap()
    }

    func testFeedPlusOpensAttachmentMenu() throws {
        app.buttons["添加附件"].tap()
        XCTAssertTrue(app.buttons["关闭附件菜单"].waitForExistence(timeout: 5))
        XCTAssertTrue(button(containing: "照片与视频").exists)
        XCTAssertTrue(button(containing: "文件").exists)
        XCTAssertFalse(app.buttons["关闭新消息"].exists)
        attachScreenshot(named: "feed-independent-attachment-menu")
        app.buttons["关闭附件菜单"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
    }

    func testComposerActionsStayAboveSoftwareKeyboardInBothOrientations() throws {
        try verifyComposerWithSoftwareKeyboard(scrollForActions: false)
    }

    func testAccessibilityComposerActionsRemainReachableWithSoftwareKeyboard() throws {
        try verifyComposerWithSoftwareKeyboard(scrollForActions: true)
    }

    func testComposerPickersCanBeCancelledWithSoftwareKeyboard() throws {
        try verifyComposerWithSoftwareKeyboard(scrollForActions: false, cancelPickers: true)
    }

    func testAccessibilityComposerPickersCanBeCancelledWithSoftwareKeyboard() throws {
        try verifyComposerWithSoftwareKeyboard(scrollForActions: true, cancelPickers: true)
    }

    func testAccessibilityComposerAttachmentWithSoftwareKeyboard() throws {
        try verifyComposerWithSoftwareKeyboard(scrollForActions: true, attachment: true)
    }

    private func verifyComposerWithSoftwareKeyboard(scrollForActions: Bool, cancelPickers: Bool = false, attachment: Bool = false) throws {
        app.terminate()
        app.launchEnvironment["TRANSFER_GENIE_IOS_LAYOUT_PROBE"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        defer {
            if app.buttons["关闭新消息"].exists { app.buttons["关闭新消息"].tap() }
            XCUIDevice.shared.orientation = .portrait
            app.terminate()
            app.launchEnvironment.removeValue(forKey: "TRANSFER_GENIE_IOS_LAYOUT_PROBE")
            app.launch()
        }
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            let rotated = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                let frame = self.app.windows.firstMatch.frame
                return orientation == .portrait ? frame.height > frame.width : frame.width > frame.height
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [rotated], timeout: 10), .completed)
            XCTAssertTrue(app.buttons["新消息"].isHittable)
            app.buttons["新消息"].tap()
            let editor = composerEditor()
            XCTAssertTrue(editor.waitForExistence(timeout: 5))
            let original = editor.value as? String ?? ""
            guard original.isEmpty || original.hasPrefix("输入文字") else {
                throw XCTSkip("Preserve an existing draft; this layout test needs an empty composer")
            }
            guard app.buttons.matching(identifier: "移除附件").count == 0 else {
                throw XCTSkip("Preserve existing draft attachments; this layout test needs an empty composer")
            }
            let keyboard = app.keyboards.firstMatch
            // Opening the sheet already focuses the editor. Re-tapping the focused
            // text view opens the large system edit menu and intercepts scrolling.
            if !keyboard.exists { editor.tap() }
            XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
            let pickerDraft = cancelPickers ? "x" : original
            if cancelPickers {
                editor.typeText(pickerDraft)
                XCTAssertEqual(editor.value as? String ?? "", pickerDraft, "The picker regression needs an enabled send action without sending the draft")
                XCTAssertTrue(app.buttons["发送"].isEnabled)
            }
            let keyboardTop = keyboard.frame.minY
            XCTAssertGreaterThan(keyboard.frame.height, 100, "A real software keyboard, not just the hardware accessory bar, must be visible")
            attachScreenshot(named: "composer-software-keyboard-\(orientation.rawValue)")
            XCTAssertLessThan(editor.frame.minY, keyboardTop)
            func verifyReachable(_ control: XCUIElement) {
                let keyboardTop = keyboard.frame.minY
                func contentDisplacement() -> (horizontal: Double, vertical: Double, centerHit: Bool)? {
                    guard scrollForActions, control.label != "关闭新消息" else { return (0, 0, true) }
                    let probe = app.staticTexts["Simulator layout geometry"]
                    guard probe.exists, let value = probe.value as? String,
                          let data = value.data(using: .utf8),
                          let snapshot = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let rects = snapshot["rects"] as? [String: [String: Any]],
                          let content = rects[".mobile-compose-actions"].flatMap({ ($0["display"] as? String) != "contents" ? $0 : nil }) ?? rects[".mobile-composer-content"].flatMap({ ($0["display"] as? String) != "contents" ? $0 : nil }) ?? rects[".mobile-composer-sheet"],
                          let top = content["y"] as? Double, let height = content["height"] as? Double,
                          let left = content["x"] as? Double, let width = content["width"] as? Double,
                          let target = rects[control.label == "发送" ? ".mobile-composer-sheet .mobile-primary-button" : control.label.contains("照片") ? ".mobile-compose-tools button:nth-child(1)" : control.label.contains("文件") ? ".mobile-compose-tools button:nth-child(2)" : control.label.contains("标记") ? ".mobile-compose-tools button:nth-child(3)" : control.label == "移除附件" ? ".mobile-attachment-strip button[aria-label=\"移除附件\"]" : ".mobile-attachment-strip .mobile-draft-open"],
                          let targetTop = target["y"] as? Double, let targetHeight = target["height"] as? Double,
                          let targetLeft = target["x"] as? Double, let targetWidth = target["width"] as? Double else {
                        XCTFail("Simulator layout probe must expose actual DOM clipping bounds")
                        return nil
                    }
                    let clipLeft = max(left, target["clipLeft"] as? Double ?? left)
                    let clipRight = min(left + width, target["clipRight"] as? Double ?? left + width)
                    let clipTop = max(top, target["clipTop"] as? Double ?? top)
                    let clipBottom = min(top + height, target["clipBottom"] as? Double ?? top + height)
                    let dx = targetLeft < clipLeft - 1 ? targetLeft - clipLeft : max(0, targetLeft + targetWidth - clipRight)
                    let dy = targetTop < clipTop - 1 ? targetTop - clipTop : max(0, targetTop + targetHeight - clipBottom)
                    return (dx, dy, target["centerHit"] as? Bool ?? false)
                }
                let visibleBottom = keyboardTop
                print("KEYBOARD_ACTION_FRAME \(orientation.rawValue) \(control.label) \(control.frame) keyboardTop=\(keyboardTop) enabled=\(control.isEnabled)")
                if scrollForActions {
                    for _ in 0..<20 {
                        let frame = control.frame
                        XCTAssertTrue(keyboard.exists, "Scrolling actions must not dismiss the software keyboard")
                        print("KEYBOARD_ACTION_FRAME \(control.label) \(frame)")
                        let displacement = contentDisplacement() ?? (horizontal: 0, vertical: 0, centerHit: false)
                        if frame.width >= 44 && frame.height >= 44 && frame.minY >= 0 && frame.maxY <= visibleBottom && abs(displacement.horizontal) <= 1 && abs(displacement.vertical) <= 1 && displacement.centerHit && control.isHittable { break }
                        let surface = app.coordinate(withNormalizedOffset: .zero)
                        let landscape = self.app.windows.firstMatch.frame.width > self.app.windows.firstMatch.frame.height
                        let startY = landscape ? min(keyboardTop - 70, self.app.buttons["关闭新消息"].frame.maxY + 44) : max(70, keyboardTop - 130)
                        let needsDown = displacement.vertical < -1 || (abs(displacement.vertical) <= 1 && frame.minY < 55)
                        let endY = needsDown ? min(keyboardTop - 20, startY + 100) : max(20, startY - (landscape ? 65 : 100))
                        // Stay inside the scroll region and away from the fixed close
                        // button and keyboard accessory bar.
                        let gutterX = landscape ? self.app.buttons["关闭新消息"].frame.minX - 45 : self.app.windows.firstMatch.frame.width * 0.7
                        let endX = landscape && abs(displacement.horizontal) > 1 ? gutterX + (displacement.horizontal > 0 ? -100 : 100) : gutterX
                        surface.withOffset(CGVector(dx: gutterX, dy: startY))
                            .press(forDuration: 0.05, thenDragTo: surface.withOffset(CGVector(dx: endX, dy: endX == gutterX ? endY : startY)), withVelocity: .slow, thenHoldForDuration: 0.4)
                    }
                }
                if control.frame.width < 44 || control.frame.height < 44 || control.frame.minY < 0 || control.frame.maxY > visibleBottom + 1 || !control.isHittable {
                    print("SOFTWARE_KEYBOARD_CAPTURE_FAILURE_\(orientation.rawValue)")
                    let capture = XCTestExpectation(description: "Capture failing native framebuffer")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { capture.fulfill() }
                    _ = XCTWaiter.wait(for: [capture], timeout: 4)
                }
                XCTAssertGreaterThanOrEqual(control.frame.width, 44, "AX frame must not be an empty clipped action: \(control.label)")
                XCTAssertGreaterThanOrEqual(control.frame.height, 44, "AX frame must not be an empty clipped action: \(control.label)")
                XCTAssertGreaterThanOrEqual(control.frame.minY, 0, "Composer action must not be scrolled above the screen: \(control.label)")
                let displacement = contentDisplacement()
                XCTAssertNotNil(displacement)
                XCTAssertTrue(abs(displacement?.horizontal ?? 999) <= 1 && abs(displacement?.vertical ?? 999) <= 1, "Action must not be clipped by its DOM scroll container: \(control.label)")
                XCTAssertTrue(displacement?.centerHit == true, "Actual DOM touch point must hit the action: \(control.label)")
                XCTAssertTrue(control.isHittable, "Composer action must remain tappable with keyboard visible: \(control.label)")
                XCTAssertLessThanOrEqual(control.frame.maxY, visibleBottom + 1, "Composer action must stay inside the visible editor area above the keyboard: \(control.label)")
                if control.label == "发送" {
                    print("SOFTWARE_KEYBOARD_CAPTURE_SEND_\(orientation.rawValue)")
                    let capture = XCTestExpectation(description: "Capture visible Send action")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { capture.fulfill() }
                    _ = XCTWaiter.wait(for: [capture], timeout: 4)
                }
            }
            for control in [button(containing: "照片"), button(containing: "文件"), app.buttons["发送"], app.buttons["关闭新消息"]] {
                verifyReachable(control)
            }
            if attachment {
                let files = button(containing: "文件")
                verifyReachable(files)
                files.tap()
                var fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document")).firstMatch
                if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
                    browse.tap()
                    fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document")).firstMatch
                }
                XCTAssertTrue(fixture.waitForExistence(timeout: 15), "Only the dedicated document fixture may be selected")
                fixture.tap()
                let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
                XCTAssertNotNil(open)
                open?.tap()
                let preview = button(containing: "预览附件 TG-IOS-PROBE-20261027-document.txt")
                XCTAssertTrue(preview.waitForExistence(timeout: 15))
                if !keyboard.exists { editor.tap() }
                XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
                XCTAssertGreaterThan(keyboard.frame.height, 100)
                for control in [app.buttons["发送"], preview, app.buttons["移除附件"], button(containing: "标记")] {
                    verifyReachable(control)
                }
                let mark = button(containing: "标记")
                mark.tap()
                if !keyboard.exists { editor.tap() }
                XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
                verifyReachable(mark)
                mark.tap()
                if !keyboard.exists { editor.tap() }
                XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
                verifyReachable(preview)
                preview.tap()
                let done = firstExistingButton(labels: ["完成", "Done"], timeout: 15)
                XCTAssertNotNil(done, "Dedicated draft must open in system preview")
                done?.tap()
                XCTAssertTrue(preview.waitForExistence(timeout: 10))
                if !keyboard.exists { editor.tap() }
                XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
                verifyReachable(app.buttons["发送"])
                print("SOFTWARE_KEYBOARD_CAPTURE_ATTACHMENT_\(orientation.rawValue)")
                let attachmentCapture = XCTestExpectation(description: "Capture enabled Send with the actual attachment draft")
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { attachmentCapture.fulfill() }
                XCTAssertEqual(XCTWaiter.wait(for: [attachmentCapture], timeout: 4), .completed)
                let remove = app.buttons["移除附件"]
                verifyReachable(remove)
                remove.tap()
                XCTAssertFalse(remove.exists, "Only the dedicated unsent draft attachment is removed")
            }
            if cancelPickers {
                for label in ["照片", "文件"] {
                    let action = button(containing: label)
                    XCTAssertTrue(keyboard.exists, "The attachment action must start with the software keyboard still open")
                    verifyReachable(action)
                    attachScreenshot(named: "keyboard-picker-ready-\(orientation.rawValue)-\(label)")
                    action.tap()
                    let cancel = firstExistingButton(labels: ["取消", "Cancel"], timeout: 10)
                    XCTAssertNotNil(cancel, "Native picker must open from the visible \(label) action")
                    cancel?.tap()
                    XCTAssertTrue(editor.waitForExistence(timeout: 10))
                    XCTAssertEqual(editor.value as? String ?? "", pickerDraft, "Cancelling the picker must preserve the unsent draft")
                    if !keyboard.exists { editor.tap() }
                    XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
                    XCTAssertGreaterThan(keyboard.frame.height, 100)
                    verifyReachable(app.buttons["发送"])
                    verifyReachable(app.buttons["关闭新消息"])
                }
            }
            print("SOFTWARE_KEYBOARD_CAPTURE_READY_\(orientation.rawValue)")
            // Give the host harness time to capture the native framebuffer; Xcode's
            // app screenshot may retain stale portrait dimensions after rotation.
            let captureWindow = XCTestExpectation(description: "Host Simulator framebuffer capture")
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { captureWindow.fulfill() }
            XCTAssertEqual(XCTWaiter.wait(for: [captureWindow], timeout: 4), .completed)
            app.buttons["关闭新消息"].tap()
            XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
            if cancelPickers {
                // The one-character layout draft is deliberately never sent. Restart
                // between orientations so it cannot survive in the user's in-memory composer.
                app.terminate()
                app.launch()
                XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
                XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
            }
        }
    }

    func testSendTextAndObserveCloudConvergence() throws {
        let probe = "TG-IOS-PROBE-20261026-SIMULATOR-TEXT"
        app.buttons["新消息"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText(probe)
        dismissKeyboardIfNeeded()

        let send = app.buttons["发送"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isEnabled)
        send.tap()

        XCTAssertTrue(app.staticTexts[probe].waitForExistence(timeout: 20), "The locally persisted message did not appear in the feed")
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45), "The Supabase outbox did not converge back to synced")

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts[probe].waitForExistence(timeout: 20), "The sent message was not restored after process termination")
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
        attachScreenshot(named: "text-send-restored-after-termination")
    }

    func testSendRichMarkdownFixture() throws {
        let marker = "TG-WYSIWYG-" + UUID().uuidString
        if !app.buttons["关闭新消息"].exists { app.buttons["新消息"].tap() }
        dismissKeyboardIfNeeded()
        XCTAssertTrue(app.switches["文字"].waitForExistence(timeout: 5))
        app.switches["文字"].tap()
        let plain = composerEditor()
        XCTAssertTrue(plain.waitForExistence(timeout: 5))
        let original = plain.value as? String ?? ""
        guard (original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || original == "输入文字，或加入照片和文件…" || original == "写下你的想法…\n选中文字，用上方工具添加格式。"),
              app.buttons.matching(identifier: "移除附件").count == 0,
              app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记 ·")).count == 0 else {
            throw XCTSkip("Preserve an existing unsent draft")
        }
        app.switches["Markdown"].tap()
        let rich = composerEditor()
        XCTAssertTrue(rich.waitForExistence(timeout: 5))
        rich.tap()
        rich.typeText(marker + "\n")
        app.switches["粗体"].tap()
        rich.typeText("bold")
        app.switches["粗体"].tap()
        rich.typeText(" tail\n")
        app.switches["无序列表"].tap()
        rich.typeText("list END")
        dismissKeyboardIfNeeded()
        XCTAssertTrue(app.buttons["发送"].isEnabled)
        app.buttons["发送"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["搜索消息"].waitForExistence(timeout: 30))
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(marker)
        XCTAssertTrue(app.staticTexts[marker].waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1, "Only the dedicated fixture should match")
        attachScreenshot(named: "sent-rich-markdown-after-restart")
        // Only delete the exact unique result just verified after restart.
        dismissSearchKeyboard()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
    }

    func testRecoverExactInterruptedRichMarkdownFixtureAndCleanup() throws {
        let marker = "TG-WYSIWYG-RECOVER-" + UUID().uuidString
        if !app.buttons["关闭新消息"].exists { app.buttons["新消息"].tap() }
        dismissKeyboardIfNeeded()
        if app.switches["Markdown"].exists { app.switches["Markdown"].tap() }
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let interrupted = editor.value as? String ?? ""
        let fixtureFingerprint = interrupted
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "•", with: "")
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
            .uppercased()
        guard fixtureFingerprint.range(of: #"^[A-F0-9]{6}BOLDTAILLISTEND$"#, options: .regularExpression) != nil,
              app.buttons.matching(identifier: "移除附件").count == 0,
              app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记 ·")).count == 0 else {
            throw XCTSkip("Preserve any draft that is not the exact interrupted rich-Markdown fixture")
        }
        editor.tap()
        editor.typeText("\n" + marker)
        dismissKeyboardIfNeeded()
        XCTAssertTrue(app.buttons["发送"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["发送"].isEnabled)
        app.buttons["发送"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))

        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(marker)
        XCTAssertTrue(app.staticTexts[marker].waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1, "Only the recovered fixture may be deleted")
        dismissSearchKeyboard()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
    }

    func testRecoverExactUnsentRichMarkdownFixtureAndCleanup() throws {
        if !app.buttons["关闭新消息"].exists { app.buttons["新消息"].tap() }
        dismissKeyboardIfNeeded()
        if app.switches["Markdown"].exists { app.switches["Markdown"].tap() }
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let interrupted = editor.value as? String ?? ""
        let markerExpression = #"TG-WYSIWYG-[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}"#
        guard let range = interrupted.uppercased().range(of: markerExpression, options: .regularExpression),
              app.buttons.matching(identifier: "移除附件").count == 0,
              app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "已标记 ·")).count == 0 else {
            throw XCTSkip("Preserve any draft that is not the exact unsent rich-Markdown fixture")
        }
        let marker = String(interrupted.uppercased()[range])
        let fingerprint = interrupted
            .replacingOccurrences(of: marker, with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "-", with: "")
            .replacingOccurrences(of: "•", with: "")
            .components(separatedBy: .whitespacesAndNewlines)
            .joined()
            .uppercased()
        guard fingerprint == "BOLDTAILLISTEND" else {
            throw XCTSkip("Preserve a draft whose body is not the exact test fixture")
        }
        XCTAssertTrue(app.buttons["发送"].isEnabled)
        app.buttons["发送"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))

        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(marker)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", marker)).firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        dismissSearchKeyboard()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
    }

    func testCleanupExactRecoveredRichMarkdownMessage() throws {
        let marker = "TG-WYSIWYG-RECOVER-A35755C7-14CB-4CB1-B707-8E8D18EC0921"
        XCTAssertTrue(app.buttons["搜索消息"].isHittable)
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(marker)
        XCTAssertTrue(app.staticTexts[marker].waitForExistence(timeout: 20))
        guard app.buttons.matching(identifier: "更多操作").count == 1 else {
            throw XCTSkip("Delete only the one exact recovered fixture result")
        }
        dismissSearchKeyboard()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
    }

    func testExactRecoveredRichMarkdownMessageIsGone() {
        let marker = "TG-WYSIWYG-RECOVER-A35755C7-14CB-4CB1-B707-8E8D18EC0921"
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(marker)
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 0)
    }

    func testTwentyColdStartsRestoreSignedInShell() {
        for cycle in 1...20 {
            app.terminate()
            XCTAssertTrue(app.wait(for: .notRunning, timeout: 10))
            app.launch()
            XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
            XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30), "Cold start \(cycle) did not restore the signed-in shell")
            XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
            XCTAssertTrue(app.buttons["新消息"].isHittable)
            print("Simulator cold start completed: \(cycle)/20")
        }
        verifyDedicatedDocumentStillSearchable()
        attachScreenshot(named: "twenty-cold-starts-restored")
    }

    func testExpiredSessionRefreshSurvivesColdRestart() {
        app.terminate()
        app.launchEnvironment = [
            "TRANSFER_GENIE_IOS_SIMULATOR_AUTH_TEST": "expire-active-session",
        ]
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 45), "Expired Session did not refresh into the signed-in shell")
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 90))
        app.buttons["我的"].tap()
        XCTAssertTrue(app.staticTexts["已登录"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["退出登录"].exists)
        attachScreenshot(named: "expired-session-refreshed")

        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 10))
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 45), "Rotated Session was not restored after the next cold start")
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 90))
        verifyDedicatedDocumentStillSearchable()
        attachScreenshot(named: "refreshed-session-restored-after-cold-start")
    }

    func testLowStorageDocumentImportFailsRecoverably() {
        app.terminate()
        app.launchEnvironment = [
            "TRANSFER_GENIE_IOS_SIMULATOR_IMPORT_TEST": "no-space",
        ]
        defer { app.terminate(); app.launchEnvironment = [:]; app.launch() }
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        var fixture = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document"))
            .firstMatch
        if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
            browse.tap()
            fixture = app.descendants(matching: .any)
                .matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-PROBE-20261027-document"))
                .firstMatch
        }
        XCTAssertTrue(fixture.waitForExistence(timeout: 15))
        fixture.tap()
        let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
        XCTAssertNotNil(open)
        open?.tap()

        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "存储空间不足")).firstMatch.waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "移除附件").count, 0, "A failed copy must not publish a partial draft attachment")
        XCTAssertFalse(app.buttons["发送"].isEnabled)
        attachScreenshot(named: "low-storage-document-import-recoverable-error")
        app.buttons["关闭新消息"].tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 5))
    }

    func testBlockedHttpPersistsTextAcrossRestartAndRecovers() {
        let probe = "TG-IOS-OFFLINE-" + UUID().uuidString
        print("Dedicated blocked-network fixture: \(probe)")
        app.terminate()
        app.launchEnvironment = [
            "HTTP_PROXY": "http://127.0.0.1:17991",
            "HTTPS_PROXY": "http://127.0.0.1:17991",
            "ALL_PROXY": "http://127.0.0.1:17991",
            "NO_PROXY": "",
            "no_proxy": "",
        ]
        defer {
            app.terminate()
            app.launchEnvironment = [:]
            app.launch()
        }
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        let editor = composerEditor()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText(probe)
        dismissKeyboardIfNeeded()
        app.buttons["发送"].tap()
        XCTAssertTrue(app.staticTexts[probe].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，离线").waitForExistence(timeout: 45))
        XCTAssertFalse(button(containing: "存储空间，已同步").exists)
        print("Blocked-network fixture saved locally and not cloud-confirmed")
        attachScreenshot(named: "blocked-http-text-saved-locally")

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts[probe].waitForExistence(timeout: 15))
        XCTAssertTrue(button(containing: "存储空间，离线").waitForExistence(timeout: 45))
        print("Blocked-network fixture restored after process termination")
        attachScreenshot(named: "blocked-http-text-restored")

        app.terminate()
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(probe)
        XCTAssertTrue(app.staticTexts[probe].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1, "Recovery must not duplicate the dedicated message")
        print("Blocked-network fixture converged after restoring HTTP connectivity")
        attachScreenshot(named: "blocked-http-text-converged")
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
    }

    func testCleanupDedicatedFailedBatchFixtures() {
        let failedFixtures = [
            ("TG-IOS-BATCH-F13E3328-F50E-45BA-A082-2C19B6B1D37F", ["A"]),
            ("TG-IOS-BATCH-6BBAB92B-4A4F-4DB9-A582-07CE9C212FFB", ["A", "B"]),
            ("TG-IOS-BATCH-59BA2290-B3E2-4FA0-81DF-8BB2BB7A52CE", ["A", "B"]),
            ("TG-IOS-BATCH-21B92A85-29FA-4BE1-8300-7AC52BE7B4FA", ["A", "B"]),
        ]
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        for (prefix, suffixes) in failedFixtures {
            search.tap()
            search.typeText(prefix)
            let ready = NSPredicate { _, _ in
                self.app.staticTexts[prefix + "-" + suffixes[0]].exists || self.app.staticTexts["没有找到相关内容"].exists
            }
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: ready, object: nil)], timeout: 15), .completed)
            if app.staticTexts["没有找到相关内容"].exists {
                XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 0)
                app.buttons["清除"].tap()
                continue
            }
            for suffix in suffixes { XCTAssertTrue(app.staticTexts[prefix + "-" + suffix].waitForExistence(timeout: 15)) }
            dismissSearchKeyboard()
            XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, suffixes.count)
            app.buttons["更多操作"].firstMatch.tap()
            button(containing: "多选").tap()
            for suffix in suffixes.dropFirst() {
                app.descendants(matching: .any).matching(identifier: "选择消息 " + prefix + "-" + suffix).firstMatch.tap()
            }
            XCTAssertTrue(app.staticTexts["已选择 \(suffixes.count) 条"].waitForExistence(timeout: 5))
            app.buttons["删除"].tap()
            XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
            app.buttons["确认删除"].tap()
            XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
            XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
            app.buttons["清除"].tap()
        }
    }

    func testBlockedHttpAttachmentSurvivesTerminationAndUploads() {
        let fixtureName = "TG-IOS-OFFLINE-20261027-attachment.txt"
        let pickerName = "TG-IOS-OFFLINE-20261027-attachment"
        app.terminate()
        app.launchEnvironment = [
            "HTTP_PROXY": "http://127.0.0.1:17991",
            "HTTPS_PROXY": "http://127.0.0.1:17991",
            "ALL_PROXY": "http://127.0.0.1:17991",
            "NO_PROXY": "",
            "no_proxy": "",
        ]
        defer { app.terminate(); app.launchEnvironment = [:]; app.launch() }
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        var fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", pickerName)).firstMatch
        if !fixture.waitForExistence(timeout: 3), let browse = firstExistingButton(labels: ["浏览", "Browse"], timeout: 5) {
            browse.tap()
            fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", pickerName)).firstMatch
        }
        XCTAssertTrue(fixture.waitForExistence(timeout: 15))
        fixture.tap()
        let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
        XCTAssertNotNil(open)
        open?.tap()
        XCTAssertTrue(button(containing: "预览附件 " + fixtureName).waitForExistence(timeout: 15))
        app.buttons["发送"].tap()
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，离线").waitForExistence(timeout: 45))
        print("Blocked attachment locally committed: \(fixtureName)")
        attachScreenshot(named: "blocked-attachment-locally-committed")

        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertTrue(button(containing: "存储空间，离线").waitForExistence(timeout: 45))
        print("Blocked attachment restored after termination")
        attachScreenshot(named: "blocked-attachment-restored")

        app.terminate()
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 60))
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(fixtureName)
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        app.staticTexts.matching(identifier: fixtureName).allElementsBoundByIndex.last!.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        button(containing: "系统预览").tap()
        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 15)
        XCTAssertNotNil(done, "Recovered sandbox attachment must still open in Quick Look")
        attachScreenshot(named: "blocked-attachment-recovered-preview")
        done?.tap()
        app.buttons["关闭详情"].tap()
        print("Blocked attachment uploaded and previewed after recovery")
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
    }

    @MainActor
    func testSlowUploadTerminationRestoresSameAttachment() async throws {
        let fixtureName = "TG-IOS-SLOW-20261027-upload.bin"
        let pickerName = "TG-IOS-SLOW-20261027-upload"
        let baseline = try await slowProxyForwardedBytes()
        app.terminate()
        let proxyURL = slowProxyURL.absoluteString
        app.launchEnvironment = [
            "HTTP_PROXY": proxyURL,
            "HTTPS_PROXY": proxyURL,
            "ALL_PROXY": proxyURL,
            "NO_PROXY": "", "no_proxy": "",
        ]
        defer { app.terminate(); app.launchEnvironment = [:]; app.launch() }
        app.launch()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        let fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", pickerName)).firstMatch
        XCTAssertTrue(fixture.waitForExistence(timeout: 15), "Start the loopback slow proxy and prepare its dedicated 8 MiB fixture first")
        fixture.tap()
        let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
        XCTAssertNotNil(open)
        open?.tap()
        XCTAssertTrue(button(containing: "预览附件 " + fixtureName).waitForExistence(timeout: 15))
        app.buttons["发送"].tap()
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 20))
        let deadline = Date().addingTimeInterval(30)
        var forwarded = try await slowProxyForwardedBytes() - baseline
        while forwarded <= 1024 * 1024 && Date() < deadline {
            try await Task.sleep(nanoseconds: 500_000_000)
            forwarded = try await slowProxyForwardedBytes() - baseline
        }
        XCTAssertGreaterThan(forwarded, 1024 * 1024)
        XCTAssertLessThan(forwarded, 8 * 1024 * 1024, "Termination must happen before the entire source crosses the tunnel")
        XCTAssertFalse(button(containing: "存储空间，已同步").exists)
        print("Slow upload before termination: \(forwarded) source body bytes forwarded")
        attachScreenshot(named: "slow-upload-in-flight-before-termination")
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 10))

        // Keep restart offline so persistence/recovery is inspected before completion.
        app.launchEnvironment["HTTP_PROXY"] = "http://127.0.0.1:17991"
        app.launchEnvironment["HTTPS_PROXY"] = "http://127.0.0.1:17991"
        app.launchEnvironment["ALL_PROXY"] = "http://127.0.0.1:17991"
        app.launch()
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertTrue(button(containing: "存储空间，离线").waitForExistence(timeout: 45))
        print("Slow upload restored while HTTP remains blocked")
        attachScreenshot(named: "slow-upload-persisted-after-termination")

        app.terminate()
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 90))
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(fixtureName)
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1, "In-flight termination must not duplicate the attachment")
        print("Slow upload converged to exactly one attachment after restoring normal HTTP")
        attachScreenshot(named: "slow-upload-recovered-without-duplicate")
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
    }

    @MainActor
    func testSlowDownloadTerminationRecoversVerifiedCache() async throws {
        let fixtureName = "TG-IOS-SLOW-20261027-download.bin"
        let baseline = try await slowProxyForwardedBytes(direction: "Download")
        defer { app.terminate(); app.launchEnvironment = [:]; app.launch() }
        if !app.staticTexts[fixtureName].firstMatch.waitForExistence(timeout: 3) {
        app.buttons["新消息"].tap()
        XCTAssertTrue(composerEditor().waitForExistence(timeout: 5))
        dismissKeyboardIfNeeded()
        button(containing: "文件").tap()
        let fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "TG-IOS-SLOW-20261027-download")).firstMatch
        XCTAssertTrue(fixture.waitForExistence(timeout: 15))
        fixture.tap()
        let open = firstExistingButton(labels: ["打开", "Open"], timeout: 5)
        XCTAssertNotNil(open)
        open?.tap()
        XCTAssertTrue(button(containing: "预览附件 " + fixtureName).waitForExistence(timeout: 15))
        app.buttons["发送"].tap()
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 90))
        }
        XCTAssertEqual(app.staticTexts.matching(identifier: fixtureName).count, 1, "Only the dedicated singleton fixture may be reused")
        app.staticTexts[fixtureName].firstMatch.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        app.buttons["更多"].tap()
        button(containing: "仅移除本地附件缓存").tap()
        XCTAssertTrue(app.buttons["新消息"].waitForExistence(timeout: 10))

        app.terminate()
        let proxyURL = slowProxyURL.absoluteString
        app.launchEnvironment = [
            "HTTP_PROXY": proxyURL,
            "HTTPS_PROXY": proxyURL,
            "ALL_PROXY": proxyURL,
            "NO_PROXY": "", "no_proxy": "",
        ]
        app.launch()
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 30))
        app.staticTexts[fixtureName].firstMatch.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "按需下载")).firstMatch.exists)
        button(containing: "系统预览").tap()
        let deadline = Date().addingTimeInterval(30)
        var forwarded = try await slowProxyForwardedBytes(direction: "Download") - baseline
        while forwarded <= 2 * 1024 * 1024 && Date() < deadline {
            try await Task.sleep(nanoseconds: 500_000_000)
            forwarded = try await slowProxyForwardedBytes(direction: "Download") - baseline
        }
        XCTAssertGreaterThan(forwarded, 2 * 1024 * 1024)
        XCTAssertLessThan(forwarded, 8 * 1024 * 1024)
        print("Slow download before termination: \(forwarded) source body bytes forwarded")
        attachScreenshot(named: "slow-download-in-flight-before-termination")
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 10))
        app.launchEnvironment["HTTP_PROXY"] = "http://127.0.0.1:17991"
        app.launchEnvironment["HTTPS_PROXY"] = "http://127.0.0.1:17991"
        app.launchEnvironment["ALL_PROXY"] = "http://127.0.0.1:17991"
        app.launch()
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 30))
        XCTAssertTrue(button(containing: "存储空间，离线").waitForExistence(timeout: 45))
        app.staticTexts[fixtureName].firstMatch.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "按需下载")).firstMatch.exists, "A partial must not be advertised as an offline cache")
        print("Slow download restored offline without a complete-cache claim")
        attachScreenshot(named: "slow-download-offline-after-termination")

        app.terminate()
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 90))
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(fixtureName)
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        app.staticTexts.matching(identifier: fixtureName).allElementsBoundByIndex.last!.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "原件已缓存")).firstMatch.waitForExistence(timeout: 30))
        print("Slow download automatically recovered to a complete cache")
        attachScreenshot(named: "slow-download-recovered-cache")
        app.buttons["关闭详情"].tap()
        // Keep this exact disposable record until the host verifies cached size/SHA-256.
    }

    func testCleanupVerifiedSlowDownloadFixture() {
        let fixtureName = "TG-IOS-SLOW-20261027-download.bin"
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(fixtureName)
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
    }

    private func slowProxyForwardedBytes(direction: String = "Upload") async throws -> Int {
        var request = URLRequest(url: slowProxyURL.appendingPathComponent("status"))
        request.timeoutInterval = 3
        let (data, _) = try await URLSession.shared.data(for: request)
        let status = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return status?["large" + direction + "BytesForwarded"] as? Int ?? 0
    }

    private var slowProxyURL: URL {
        let configured = ProcessInfo.processInfo.environment["TRANSFER_GENIE_TEST_SLOW_PROXY_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let configured, !configured.isEmpty, let url = URL(string: configured), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else {
            return URL(string: "http://127.0.0.1:17992")!
        }
        return url
    }

    func testRecoveredBlockedAttachmentPreviewAndCleanup() {
        let fixtureName = "TG-IOS-OFFLINE-20261027-attachment.txt"
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(fixtureName)
        XCTAssertTrue(app.staticTexts[fixtureName].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "更多操作").count, 1)
        app.staticTexts.matching(identifier: fixtureName).allElementsBoundByIndex.last!.tap()
        XCTAssertTrue(app.buttons["关闭详情"].waitForExistence(timeout: 5))
        button(containing: "系统预览").tap()
        let done = firstExistingButton(labels: ["完成", "Done"], timeout: 15)
        XCTAssertNotNil(done)
        attachScreenshot(named: "recovered-blocked-attachment-preview")
        done?.tap()
        app.buttons["关闭详情"].tap()
        app.buttons["更多操作"].firstMatch.tap()
        button(containing: "删除消息（同步到云端）").tap()
        XCTAssertTrue(app.buttons["确认删除"].waitForExistence(timeout: 5))
        app.buttons["确认删除"].tap()
        XCTAssertTrue(app.staticTexts["没有找到相关内容"].waitForExistence(timeout: 20))
        XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
    }

    func testFiftyBackgroundForegroundCyclesRestoreShell() {
        for cycle in 1...50 {
            XCUIDevice.shared.press(.home)
            XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10), "Cycle \(cycle) did not enter the background")
            app.activate()
            XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
            XCTAssertTrue(button(containing: "存储空间，已同步").waitForExistence(timeout: 45))
            XCTAssertTrue(app.buttons["新消息"].isHittable)
            print("Simulator foreground recovery completed: \(cycle)/50")
        }
        verifyDedicatedDocumentStillSearchable()
        attachScreenshot(named: "fifty-foreground-recoveries-restored")
    }

    private func verifyDedicatedDocumentStillSearchable() {
        app.buttons["搜索消息"].tap()
        let search = app.searchFields["搜索文本、文件名"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("TG-IOS-PROBE-20261027-document")
        XCTAssertTrue(app.staticTexts["TG-IOS-PROBE-20261027-document.txt"].waitForExistence(timeout: 15))
        app.buttons["清除"].tap()
        XCTAssertTrue(waitForNonExistence(app.staticTexts["搜索当前空间已同步到本机的消息"], timeout: 5))
        XCTAssertFalse(app.buttons["清除"].exists)
    }

    private func dismissKeyboardIfNeeded() {
        if app.buttons["收起键盘"].exists {
            app.buttons["收起键盘"].tap()
            XCTAssertTrue(app.buttons["发送"].waitForExistence(timeout: 5), "Composer actions did not return after dismissing the rich editor")
            return
        }
        guard app.keyboards.firstMatch.exists else { return }
        if let done = firstExistingButton(labels: ["完成", "Done"], timeout: 2) {
            done.tap()
        }
        XCTAssertTrue(waitForNonExistence(app.keyboards.firstMatch, timeout: 5), "Composer keyboard did not dismiss")
    }

    private func dismissSearchKeyboard() {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }
        let resultsHeading = app.staticTexts["搜索结果"]
        if resultsHeading.exists && resultsHeading.isHittable {
            resultsHeading.tap()
        }
        if keyboard.exists, let done = firstExistingButton(labels: ["完成", "Done"], timeout: 2) {
            done.tap()
        }
        XCTAssertTrue(waitForNonExistence(keyboard, timeout: 5), "Search keyboard did not dismiss before opening a result")
    }

    private func firstExistingButton(labels: [String], timeout: TimeInterval) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            for label in labels {
                let button = app.buttons[label]
                if button.exists { return button }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return nil
    }

    private func firstExistingElement(labels: [String], timeout: TimeInterval) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            for label in labels {
                let element = app.descendants(matching: .any)
                    .matching(NSPredicate(format: "label == %@ OR identifier == %@", label, label))
                    .firstMatch
                if element.exists { return element }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return nil
    }

    private func waitForNonExistence(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "exists == false")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func button(containing label: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", label)).firstMatch
    }

    private func composerEditor() -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", "消息内容", "输入文字"))
            .firstMatch
    }

    private func clearVerifiedComposerFixture(_ editor: XCUIElement) {
        // Call only after checking the exact dedicated fixture, never arbitrary drafts.
        editor.tap()
        editor.press(forDuration: 1.2)
        let selectAll = app.menuItems["Select All"].exists ? app.menuItems["Select All"] : app.buttons["Select All"]
        if selectAll.waitForExistence(timeout: 2) {
            selectAll.tap()
            editor.typeText(XCUIKeyboardKey.delete.rawValue)
        } else {
            editor.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (editor.value as? String ?? "").count))
        }
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

final class TransferGeniePhysicalDeviceSmokeTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication(bundleIdentifier: "com.transfergenie")
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
    }

    func testReadOnlyStartupState() {
        let ready = app.buttons["消息"]
        let noProfile = app.staticTexts["连接你的云端空间"]
        let chooseProfile = app.staticTexts["选择 Supabase 配置"]
        let signedOut = app.staticTexts["登录 Supabase"]
        let needsSpace = app.staticTexts["选择存储空间"]
        let failed = app.staticTexts["暂时无法打开"]
        let deadline = Date().addingTimeInterval(45)
        while Date() < deadline && ![ready, noProfile, chooseProfile, signedOut, needsSpace, failed].contains(where: \.exists) {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertTrue([ready, noProfile, chooseProfile, signedOut, needsSpace].contains(where: \.exists), "The physical-device mobile shell did not reach a usable startup state")
        XCTAssertFalse(failed.exists, "The physical-device mobile shell reported an initialization failure")
        let state = ready.exists ? "ready" : noProfile.exists ? "no-profile" : chooseProfile.exists ? "choose-profile" : signedOut.exists ? "signed-out" : "needs-space"
        print("PHYSICAL_DEVICE_STARTUP_STATE=\(state)")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "physical-device-startup-\(state)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testComposerPickerCancellationWithKeyboard() {
        XCTAssertTrue(app.buttons["消息"].waitForExistence(timeout: 30))
        app.buttons["新消息"].tap()
        let editor = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", "消息内容", "输入文字"))
            .firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))

        let photo = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "照片")).firstMatch
        XCTAssertTrue(photo.isHittable)
        photo.tap()
        let photoCancel = firstExistingButton(labels: ["取消", "Cancel"], timeout: 15)
        XCTAssertNotNil(photoCancel)
        photoCancel?.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 10))

        let file = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "文件")).firstMatch
        XCTAssertTrue(file.isHittable)
        file.tap()
        let fileCancel = firstExistingButton(labels: ["取消", "Cancel"], timeout: 15)
        XCTAssertNotNil(fileCancel)
        fileCancel?.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 10))
        app.buttons["关闭新消息"].tap()
    }

    private func firstExistingButton(labels: [String], timeout: TimeInterval) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            for label in labels {
                let element = app.buttons[label]
                if element.exists { return element }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return nil
    }
}
