use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const SETTINGS_WIDTH: f64 = 440.0;
const SETTINGS_HEIGHT: f64 = 600.0;
const SETTINGS_GAP: f64 = 8.0;
const ADD_WIDTH: f64 = 420.0;
const ADD_HEIGHT: f64 = 360.0;

#[tauri::command]
async fn fetch_stock_hints(query: String) -> Result<String, String> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(String::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("创建股票搜索请求失败：{error}"))?;
    let response = client
        .get("https://smartbox.gtimg.cn/s3/")
        .query(&[("q", query), ("t", "all")])
        .send()
        .await
        .map_err(|error| format!("股票搜索接口不可用：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("股票搜索接口返回 {status}"));
    }
    response
        .text()
        .await
        .map_err(|error| format!("读取股票搜索结果失败：{error}"))
}

#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    let minimized = window.is_minimized().map_err(|error| error.to_string())?;
    if visible && !minimized {
        window.hide().map_err(|error| error.to_string())?;
    } else {
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(!visible || minimized)
}

#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
// Windows WebView2 creation deadlocks inside a synchronous IPC command.
// Keep this async so the UI event loop can finish creating and closing windows.
async fn open_settings(app: AppHandle) -> Result<bool, String> {
    show_settings_window(&app)
}

fn window_size_and_position_near_main(
    app: &AppHandle,
    width: f64,
    height: f64,
) -> Option<(tauri::PhysicalSize<u32>, PhysicalPosition<i32>)> {
    let main = app.get_webview_window("main")?;
    let main_position = main.outer_position().ok()?;
    let main_size = main.outer_size().ok()?;
    let scale_factor = main.scale_factor().ok()?;
    let monitor = main.current_monitor().ok()??;
    let work_area = monitor.work_area();
    let settings_width = ((width * scale_factor).round() as u32)
        .min(work_area.size.width)
        .max(1) as i32;
    let settings_height = ((height * scale_factor).round() as u32)
        .min(work_area.size.height)
        .max(1) as i32;
    let gap = (SETTINGS_GAP * scale_factor).round() as i32;
    let work_right = work_area.position.x + work_area.size.width as i32;
    let work_bottom = work_area.position.y + work_area.size.height as i32;
    let right_x = main_position.x + main_size.width as i32 + gap;
    let left_x = main_position.x - settings_width - gap;
    let below_y = main_position.y + main_size.height as i32 + gap;
    let above_y = main_position.y - settings_height - gap;
    let aligned_x = main_position.x.clamp(
        work_area.position.x,
        (work_right - settings_width).max(work_area.position.x),
    );
    let aligned_y = main_position.y.clamp(
        work_area.position.y,
        (work_bottom - settings_height).max(work_area.position.y),
    );
    if right_x + settings_width <= work_right {
        Some((
            tauri::PhysicalSize::new(settings_width as u32, settings_height as u32),
            PhysicalPosition::new(right_x, aligned_y),
        ))
    } else if left_x >= work_area.position.x {
        Some((
            tauri::PhysicalSize::new(settings_width as u32, settings_height as u32),
            PhysicalPosition::new(left_x, aligned_y),
        ))
    } else if below_y + settings_height <= work_bottom {
        Some((
            tauri::PhysicalSize::new(settings_width as u32, settings_height as u32),
            PhysicalPosition::new(aligned_x, below_y),
        ))
    } else if above_y >= work_area.position.y {
        Some((
            tauri::PhysicalSize::new(settings_width as u32, settings_height as u32),
            PhysicalPosition::new(aligned_x, above_y),
        ))
    } else {
        Some((
            tauri::PhysicalSize::new(settings_width as u32, settings_height as u32),
            PhysicalPosition::new(aligned_x, aligned_y),
        ))
    }
}

fn add_window_minimum(app: &AppHandle) -> (f64, f64) {
    let available = app
        .get_webview_window("main")
        .and_then(|main| Some((main.current_monitor().ok()??, main.scale_factor().ok()?)));
    match available {
        Some((monitor, scale)) => {
            let area = monitor.work_area();
            (
                (area.size.width as f64 / scale).min(320.0).max(1.0),
                (area.size.height as f64 / scale).min(240.0).max(1.0),
            )
        }
        None => (320.0, 240.0),
    }
}

fn place_child_window(
    app: &AppHandle,
    window: &WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let Some((mut inner, preferred)) = window_size_and_position_near_main(app, width, height)
    else {
        return Ok(());
    };
    if let Some(main) = app.get_webview_window("main") {
        if let Some(monitor) = main.current_monitor().map_err(|error| error.to_string())? {
            let area = monitor.work_area();
            let outer = window.outer_size().map_err(|error| error.to_string())?;
            let current_inner = window.inner_size().map_err(|error| error.to_string())?;
            let frame_width = outer.width.saturating_sub(current_inner.width);
            let frame_height = outer.height.saturating_sub(current_inner.height);
            inner.width = inner
                .width
                .min(area.size.width.saturating_sub(frame_width).max(1));
            inner.height = inner
                .height
                .min(area.size.height.saturating_sub(frame_height).max(1));
            window.set_size(inner).map_err(|error| error.to_string())?;
            let actual = window.outer_size().map_err(|error| error.to_string())?;
            let right = area
                .position
                .x
                .saturating_add(area.size.width as i32)
                .saturating_sub(actual.width as i32);
            let bottom = area
                .position
                .y
                .saturating_add(area.size.height as i32)
                .saturating_sub(actual.height as i32);
            let x = preferred
                .x
                .clamp(area.position.x, right.max(area.position.x));
            let y = preferred
                .y
                .clamp(area.position.y, bottom.max(area.position.y));
            window
                .set_position(PhysicalPosition::new(x, y))
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
    }
    window.set_size(inner).map_err(|error| error.to_string())?;
    window
        .set_position(preferred)
        .map_err(|error| error.to_string())
}

fn show_settings_window(app: &AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("settings") {
        place_child_window(app, &window, SETTINGS_WIDTH, SETTINGS_HEIGHT)?;
        window
            .set_closable(true)
            .map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(true);
    }

    let window = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html#settings".into()),
    )
    .initialization_script("window.__ZOUMADENG_WINDOW__ = 'settings';")
    .title("走马灯设置")
    .inner_size(SETTINGS_WIDTH, SETTINGS_HEIGHT)
    .min_inner_size(390.0, 520.0)
    .resizable(true)
    .closable(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    place_child_window(app, &window, SETTINGS_WIDTH, SETTINGS_HEIGHT)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
// Creating a WebView2 window from a synchronous command can deadlock the UI thread.
async fn open_add_stock(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("add-stock") {
        place_child_window(&app, &window, ADD_WIDTH, ADD_HEIGHT)?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(true);
    }
    let (min_width, min_height) = add_window_minimum(&app);
    let window = WebviewWindowBuilder::new(
        &app,
        "add-stock",
        WebviewUrl::App("index.html#add-stock".into()),
    )
    .initialization_script("window.__ZOUMADENG_WINDOW__ = 'add-stock';")
    .title("添加自选股")
    .inner_size(ADD_WIDTH, ADD_HEIGHT)
    .min_inner_size(min_width, min_height)
    .resizable(true)
    .closable(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;
    place_child_window(&app, &window, ADD_WIDTH, ADD_HEIGHT)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn close_add_stock(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("add-stock") {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
fn close_settings(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
fn exit_app(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("add-stock") {
        let _ = window.destroy();
    }
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.destroy();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.destroy();
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn set_window_height(app: AppHandle, height: f64) -> Result<(), String> {
    if !height.is_finite() || height < 1.0 {
        return Err("窗口高度无效".to_string());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let current_size = window.inner_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let physical_height = (height * scale_factor).round().max(1.0) as u32;
    window
        .set_size(tauri::PhysicalSize::new(
            current_size.width,
            physical_height,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_window_width(app: AppHandle, width: f64) -> Result<(), String> {
    if !width.is_finite() || width < 1.0 {
        return Err("窗口宽度无效".to_string());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let current_size = window.inner_size().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let physical_width = (width * scale_factor).round().max(1.0) as u32;
    window
        .set_size(tauri::PhysicalSize::new(
            physical_width,
            current_size.height,
        ))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_window_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    match mode.as_str() {
        "top" => window
            .set_always_on_top(true)
            .map_err(|error| error.to_string())?,
        "desktop" => window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?,
        _ => return Err(format!("不支持的窗口模式：{mode}")),
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏走马灯", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &settings, &quit])?;

            let mut tray_builder = TrayIconBuilder::new();
            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }

            tray_builder
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("走马灯行情")
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        if let Some(window) = app.get_webview_window("add-stock") {
                            let _ = window.destroy();
                        }
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.destroy();
                        }
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.destroy();
                        }
                        app.exit(0);
                        return;
                    }
                    match event.id().as_ref() {
                        "toggle" => {
                            let _ = toggle_window(app.clone());
                        }
                        "settings" => {
                            let _ = show_settings_window(app);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_stock_hints,
            toggle_window,
            minimize_window,
            open_settings,
            open_add_stock,
            close_add_stock,
            close_settings,
            exit_app,
            set_window_height,
            set_window_width,
            set_window_mode
        ])
        .run(tauri::generate_context!())
        .expect("走马灯运行失败");
}
