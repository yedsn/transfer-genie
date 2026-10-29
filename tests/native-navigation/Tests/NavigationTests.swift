import XCTest

final class NavigationTests: XCTestCase {
    func testProductionCoordinatorNativeGateCancelReturnAndReentry() {
        let app = XCUIApplication()
        app.launchEnvironment["PRODUCTION_NAVIGATION"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["Open production page"].waitForExistence(timeout: 10))
        app.buttons["Open production page"].tap()
        XCTAssertTrue(app.staticTexts["Production settled"].waitForExistence(timeout: 5))
        let editor = app.textViews["Production draft"]
        editor.tap()
        editor.typeText("Production retained draft")
        app.buttons["Dismiss keyboard"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: 2, dy: app.frame.height * 0.5))
        func drag(_ amount: CGFloat, hold: TimeInterval = 0) {
            start.press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: app.frame.width * amount, dy: app.frame.height * 0.5)), withVelocity: .slow, thenHoldForDuration: hold)
        }
        app.buttons["Disable return"].tap()
        drag(0.85)
        XCTAssertTrue(app.staticTexts["Production detail"].exists)
        app.buttons["Enable return"].tap()
        drag(0.15, hold: 0.5)
        XCTAssertTrue(app.staticTexts["Production detail"].exists)
        XCTAssertEqual(editor.value as? String, "Production retained draft")
        drag(0.85)
        XCTAssertTrue(app.buttons["Open production page"].waitForExistence(timeout: 5))
        app.buttons["Open production page"].tap()
        XCTAssertTrue(app.staticTexts["Production settled"].waitForExistence(timeout: 5))
        XCTAssertEqual(editor.value as? String, "Production retained draft")
        app.buttons["Close production page"].tap()
        XCTAssertTrue(app.buttons["Open production page"].waitForExistence(timeout: 5))
    }
    private func checkEdgeBack(fixed: Bool, plugin: Bool, navigation: Bool = false, file: Bool = false) {
        let app = XCUIApplication()
        app.launchEnvironment["FIXED_CANVAS"] = fixed ? "1" : "0"
        app.launchEnvironment["USE_PLUGIN"] = plugin ? "1" : "0"
        app.launchEnvironment["HOST_NAVIGATION"] = navigation ? "1" : "0"
        app.launchEnvironment["FILE_FIXTURE"] = file ? "1" : "0"
        app.launch()
        let status = app.staticTexts["navigation-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        XCTAssertTrue(app.links["Web detail link"].waitForExistence(timeout: 5))
        app.links["Web detail link"].tap()
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label BEGINSWITH %@", "detail back=true"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
        let before = status.label
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.lifetime = .keepAlways
        add(capture)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: 2, dy: app.frame.height * 0.45))
        let end = origin.withOffset(CGVector(dx: app.frame.width * 0.85, dy: app.frame.height * 0.45))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0)
        let after = XCTAttachment(screenshot: app.screenshot())
        after.lifetime = .keepAlways
        add(after)
        let returned = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label BEGINSWITH %@", "root back=false"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [returned], timeout: 5), .completed, "Before gesture: \(before)")
    }
    func testVanillaWebKitEdgeBack() { checkEdgeBack(fixed: false, plugin: false) }
    func testWebKitHostedInNavigationController() { checkEdgeBack(fixed: false, plugin: false, navigation: true) }
    func testLocalFileWebKitEdgeBack() { checkEdgeBack(fixed: false, plugin: false, file: true) }
    func testSingleWebViewUIKitBackAndNativeGate() {
        let app = XCUIApplication()
        app.launchEnvironment["SHARED_WEBVIEW"] = "1"
        app.launch()
        XCTAssertTrue(app.staticTexts["Root"].waitForExistence(timeout: 10))
        app.buttons["Open shared detail"].tap()
        XCTAssertTrue(app.staticTexts["Shared detail"].waitForExistence(timeout: 5))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        func dragBack() {
            origin.withOffset(CGVector(dx: 2, dy: app.frame.height * 0.5))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: app.frame.width * 0.85, dy: app.frame.height * 0.5)), withVelocity: .slow, thenHoldForDuration: 0)
        }
        app.buttons["Disable return"].tap()
        dragBack()
        XCTAssertTrue(app.staticTexts["Shared detail"].exists, "native gate must reject unsafe return")
        app.buttons["Enable return"].tap()
        dragBack()
        XCTAssertTrue(app.buttons["Open shared detail"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Root"].exists)
    }
    func testSingleWebViewCancelledBackPreservesEditorAcrossReentry() {
        let app = XCUIApplication()
        app.launchEnvironment["SHARED_WEBVIEW"] = "1"
        app.launch()
        XCTAssertTrue(app.staticTexts["Root"].waitForExistence(timeout: 10))
        app.buttons["Open shared detail"].tap()
        let editor = app.textViews["Shared-draft"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText("native retained draft")
        app.buttons["Dismiss keyboard"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        XCTAssertTrue(app.staticTexts["Native detail settled"].waitForExistence(timeout: 5))
        let start = origin.withOffset(CGVector(dx: 2, dy: app.frame.height * 0.5))
        start.press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: app.frame.width * 0.15, dy: app.frame.height * 0.5)), withVelocity: .slow, thenHoldForDuration: 0.5)
        XCTAssertTrue(app.staticTexts["Shared detail"].exists, "short held gesture cancels the real UIKit transition")
        XCTAssertEqual(editor.value as? String, "native retained draft")
        start.press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: app.frame.width * 0.85, dy: app.frame.height * 0.5)), withVelocity: .slow, thenHoldForDuration: 0)
        XCTAssertTrue(app.buttons["Open shared detail"].waitForExistence(timeout: 5))
        app.buttons["Open shared detail"].tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual(editor.value as? String, "native retained draft", "same WebView preserves the original editor across native return/reentry")
    }
    func testUIKitNativePopControl() {
        let app = XCUIApplication()
        app.launchEnvironment["HOST_NAVIGATION"] = "1"
        app.launchEnvironment["NATIVE_PUSH"] = "1"
        app.launch()
        app.buttons["Open detail"].tap()
        XCTAssertTrue(app.staticTexts["Native detail"].waitForExistence(timeout: 5))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: 2, dy: app.frame.height * 0.45))
            .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: app.frame.width * 0.85, dy: app.frame.height * 0.45)), withVelocity: .slow, thenHoldForDuration: 0)
        XCTAssertTrue(app.buttons["Open detail"].waitForExistence(timeout: 5))
    }
    func testFixedCanvasWebKitEdgeBack() { checkEdgeBack(fixed: true, plugin: false) }
    func testPluginFixedCanvasEdgeBack() { checkEdgeBack(fixed: true, plugin: true) }
}
