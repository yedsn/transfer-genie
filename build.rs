fn main() {
    tauri_build::build();

    // Test binaries do not inherit the Tauri application manifest, so Windows binds
    // comctl32!TaskDialogIndirect (pulled in by the dialog stack) to the legacy v5
    // control library and the process dies with STATUS_ENTRYPOINT_NOT_FOUND.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!(
            "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }
}
