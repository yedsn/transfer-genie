use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::MobileIntegration;
#[cfg(mobile)]
use mobile::MobileIntegration;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the mobile-integration APIs.
pub trait MobileIntegrationExt<R: Runtime> {
    fn mobile_integration(&self) -> &MobileIntegration<R>;
}

impl<R: Runtime, T: Manager<R>> crate::MobileIntegrationExt<R> for T {
    fn mobile_integration(&self) -> &MobileIntegration<R> {
        self.state::<MobileIntegration<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mobile-integration")
        .invoke_handler(tauri::generate_handler![
            commands::diagnostic,
            commands::set_navigation_gestures_enabled,
            commands::navigate_native_page,
            commands::select_media,
            commands::select_documents,
            commands::preview_file,
            commands::share_file,
            commands::generate_image_thumbnail,
            commands::generate_video_poster,
            commands::cancel_video_poster
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let mobile_integration = mobile::init(app, api)?;
            #[cfg(desktop)]
            let mobile_integration = desktop::init(app, api)?;
            app.manage(mobile_integration);
            Ok(())
        })
        .build()
}
