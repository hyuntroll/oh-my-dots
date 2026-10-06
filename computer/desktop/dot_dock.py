#!/usr/bin/env python3
import os
import math
import time
import shlex
import shutil
import subprocess
from pathlib import Path

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib, GdkPixbuf

HOME = str(Path.home())
APP_DIR = os.path.join(HOME, ".local", "share", "dot-desktop")
ICON_SIZE = int(os.environ.get("DOT_ICON_SIZE", "40"))
HOVER_ICON_SIZE = int(os.environ.get("DOT_HOVER_ICON_SIZE", "62"))
BOTTOM_MARGIN = int(os.environ.get("DOT_BOTTOM_MARGIN", "12"))
ASSETS = Path(__file__).parent


def cmd_exists(name):
    return shutil.which(name) is not None


def first_command(candidates):
    for candidate in candidates:
        parts = shlex.split(candidate)
        if parts and cmd_exists(parts[0]):
            return parts
    return None


def choose_icon(candidates):
    theme = Gtk.IconTheme.get_default()
    for name in candidates:
        if theme.has_icon(name):
            return name
    return "application-x-executable"


APPS = [
    {
        "name": "Browser",
        "cmd": first_command([
            "chromium --no-sandbox --disable-dev-shm-usage --no-first-run --test-type file:///opt/dot-desktop/start.html", "chromium-browser", "google-chrome", "google-chrome-stable"
        ]),
        "tokens": ["chromium", "google-chrome", "chrome"],
        "icons": ["chromium", "chromium-browser", "google-chrome", "web-browser"],
        "asset": "browser.svg",
    },
    {
        "name": "Terminal",
        "cmd": first_command(["xfce4-terminal", "gnome-terminal", "xterm"]),
        "tokens": ["xfce4-terminal", "terminal", "xterm"],
        "icons": ["utilities-terminal", "org.xfce.terminal", "terminal"],
        "asset": "terminal.svg",
    },
    {
        "name": "Files",
        "cmd": first_command(["thunar /workspace/artifacts", "nautilus", "pcmanfm"]),
        "tokens": ["thunar", "nautilus", "pcmanfm"],
        "icons": ["folder", "org.xfce.thunar", "system-file-manager"],
        "asset": "files.svg",
    },
]


class DotDock(Gtk.Window):
    def __init__(self):
        super().__init__(title="Dot Dock")
        self.set_decorated(False)
        self.set_resizable(False)
        self.set_keep_above(True)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_type_hint(Gdk.WindowTypeHint.DOCK)
        self.stick()
        self.set_app_paintable(True)

        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual is not None and screen.is_composited():
            self.set_visual(visual)

        provider = Gtk.CssProvider()
        provider.load_from_path(os.path.join(APP_DIR, "dock.css"))
        Gtk.StyleContext.add_provider_for_screen(
            screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        self.appearance_provider = Gtk.CssProvider()
        self.appearance_stamp = None
        Gtk.StyleContext.add_provider_for_screen(screen, self.appearance_provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1)
        self.refresh_appearance()
        GLib.timeout_add(1000, self.refresh_appearance)

        # A real desktop window keeps the wallpaper visible under X11 compositing.
        self.wallpaper = Gtk.Window()
        self.wallpaper.set_name("desktop-wallpaper")
        self.wallpaper.set_decorated(False)
        self.wallpaper.set_type_hint(Gdk.WindowTypeHint.DESKTOP)
        self.wallpaper.set_keep_below(True)
        self.wallpaper.set_accept_focus(False)
        self.wallpaper.set_skip_taskbar_hint(True)
        self.wallpaper.set_skip_pager_hint(True)
        self.wallpaper.stick()
        self.wallpaper.set_default_size(screen.get_width(), screen.get_height())
        self.wallpaper.move(0, 0)
        self.wallpaper.show_all()

        self.shell = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        self.shell.set_name("dock-shell")
        self.overlay = Gtk.Overlay()
        self.overlay.set_size_request(222, 100)
        plate = Gtk.Box()
        plate.set_name("dock-plate")
        plate.set_size_request(-1, 64)
        plate.set_valign(Gtk.Align.END)
        self.overlay.add(plate)
        self.overlay.add_overlay(self.shell)
        self.add(self.overlay)
        self.motions = []

        self.items = []
        for app in APPS:
            self.add_app(app)

        self.connect("destroy", Gtk.main_quit)
        self.connect("realize", self._after_realize)
        screen.connect("size-changed", lambda *_: GLib.idle_add(self.position_dock))

        self.show_all()
        GLib.timeout_add(750, self.refresh_running)
        GLib.timeout_add(1500, lambda: (self.position_dock(), True)[1])

    def _after_realize(self, *_):
        GLib.idle_add(self.position_dock)

    def refresh_appearance(self):
        path = os.path.join(APP_DIR, 'appearance.css')
        try:
            stamp = os.stat(path).st_mtime_ns
            if stamp != self.appearance_stamp:
                self.appearance_provider.load_from_path(path)
                self.appearance_stamp = stamp
        except OSError:
            pass
        return True

    def position_dock(self):
        screen = self.get_screen()
        monitor = screen.get_primary_monitor()
        if monitor < 0:
            monitor = 0
        geo = screen.get_monitor_geometry(monitor)
        _, natural = self.get_preferred_size()
        width, height = natural.width, natural.height
        x = geo.x + max(0, (geo.width - width) // 2)
        y = geo.y + max(0, geo.height - height - BOTTOM_MARGIN)
        self.move(x, y)
        return False

    def add_app(self, app):
        item = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=0)
        item.set_size_request(66, 96)

        button = Gtk.Button()
        button.get_style_context().add_class("dock-item")
        button.set_relief(Gtk.ReliefStyle.NONE)
        button.set_can_focus(False)
        button.set_tooltip_text(app["name"])

        # Fixed hit targets prevent enter/leave jitter as the icon grows and lifts.
        canvas = Gtk.Fixed()
        canvas.set_size_request(66, 88)
        icon = Gtk.IconTheme.get_default().load_icon(
            choose_icon(app["icons"]), max(96, HOVER_ICON_SIZE * 2),
            Gtk.IconLookupFlags.FORCE_SIZE,
        )
        motion = {"hover": 0.0, "target": 0.0, "bounce": None,
                  "last": time.monotonic(), "tick": None, "pressed": False}

        image = Gtk.Image()
        canvas.put(image, 9, 25)
        sizes = {size: icon.scale_simple(size, size, GdkPixbuf.InterpType.BILINEAR)
                 for size in range(round(ICON_SIZE * 0.88), HOVER_ICON_SIZE + 1)}

        def render():
            hover = motion["hover"]
            size = round((ICON_SIZE + (HOVER_ICON_SIZE - ICON_SIZE) * hover) * (0.9 if motion["pressed"] else 1))
            bounce = 0.0
            if motion["bounce"] is not None:
                elapsed = time.monotonic() - motion["bounce"]
                bounce = 18 * abs(math.sin(elapsed * math.pi / 0.30)) * math.exp(-elapsed * 3.5)
            x = (66 - size) / 2
            y = 80 - size - hover * 5 - bounce
            image.set_from_pixbuf(sizes[size])
            canvas.move(image, round(x), round(y))

        def animate():
            now = time.monotonic()
            dt = min(now - motion["last"], 0.05)
            motion["last"] = now
            motion["hover"] += (motion["target"] - motion["hover"]) * (1 - math.exp(-dt / 0.075))
            if motion["bounce"] is not None and now - motion["bounce"] >= 0.9:
                motion["bounce"] = None
            settled = abs(motion["target"] - motion["hover"]) < 0.002
            if settled:
                motion["hover"] = motion["target"]
            render()
            if settled and motion["bounce"] is None:
                motion["tick"] = None
                return False
            return True

        def start_animation():
            if motion["tick"] is None:
                motion["last"] = time.monotonic()
                motion["tick"] = GLib.timeout_add(16, animate)

        def hover(_widget, event):
            pointer_x = event.x_root - self.get_position()[0]
            for index, (state, start) in enumerate(self.motions):
                distance = abs(pointer_x - (8 + index * 70 + 33)) / 105
                state["target"] = (1 + math.cos(math.pi * distance)) / 2 if distance < 1 else 0.0
                start()
            return False

        def leave(_widget, event):
            # Crossing between buttons keeps the continuous wave; leaving the dock resets it.
            x, y = event.x_root - self.get_position()[0], event.y_root - self.get_position()[1]
            if not (0 <= x < self.get_allocated_width() and 0 <= y < self.get_allocated_height()):
                for state, start in self.motions:
                    state["target"] = 0.0
                    start()
            return False

        def press(_widget, _event, pressed):
            motion["pressed"] = pressed
            render()
            return False

        def clicked(_button):
            motion["bounce"] = time.monotonic()
            start_animation()
            self.activate_app(app)

        def cleanup(_widget):
            if motion["tick"] is not None:
                GLib.source_remove(motion["tick"])
                motion["tick"] = None

        self.motions.append((motion, start_animation))
        render()
        canvas.connect("destroy", cleanup)
        button.add(canvas)
        dot = Gtk.Label(label="•")
        dot.get_style_context().add_class("running-dot")
        dot.get_style_context().add_class("off")
        button.connect("clicked", clicked)
        button.add_events(Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK)
        button.connect("enter-notify-event", hover)
        button.connect("motion-notify-event", hover)
        button.connect("leave-notify-event", leave)
        button.connect("button-press-event", press, True)
        button.connect("button-release-event", press, False)
        self.connect("leave-notify-event", leave)
        item.pack_start(button, False, False, 0)
        item.pack_start(dot, False, False, 0)
        self.shell.pack_start(item, False, False, 0)
        self.items.append((app, dot))

    @staticmethod
    def windows():
        try:
            output = subprocess.check_output(
                ["wmctrl", "-lx"], stderr=subprocess.DEVNULL, text=True
            )
            return [line for line in output.splitlines() if line.strip()]
        except Exception:
            return []

    def matching_window(self, app):
        tokens = [t.lower() for t in app["tokens"]]
        for line in self.windows():
            low = line.lower()
            if any(token in low for token in tokens):
                return line.split()[0]
        return None

    def activate_app(self, app):
        win = self.matching_window(app)
        if win:
            subprocess.Popen(
                ["wmctrl", "-ia", win],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return

        if not app["cmd"]:
            return
        subprocess.Popen(
            app["cmd"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

    def refresh_running(self):
        lines = "\n".join(self.windows()).lower()
        for app, dot in self.items:
            running = any(token.lower() in lines for token in app["tokens"])
            ctx = dot.get_style_context()
            if running:
                ctx.remove_class("off")
            else:
                ctx.add_class("off")
        return True


if __name__ == "__main__":
    DotDock()
    Gtk.main()
