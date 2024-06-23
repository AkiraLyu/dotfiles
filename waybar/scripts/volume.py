import gi
import subprocess

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk

class VolumeControlWindow(Gtk.Window):
    def __init__(self):
        super().__init__(title="Volume Control")

        # Set up the window
        self.set_border_width(10)
        self.set_default_size(300, 50)

        # Create a horizontal box container
        hbox = Gtk.Box(spacing=6)
        self.add(hbox)

        # Create a scale (slider) widget
        self.scale = Gtk.Scale(orientation=Gtk.Orientation.HORIZONTAL, adjustment=None)
        self.scale.set_range(0, 100)
        self.scale.set_value(self.get_system_volume())
        self.scale.set_digits(0)  # No decimal places
        self.scale.set_hexpand(True)
        self.scale.connect("value-changed", self.on_scale_value_changed)

        # Add the scale to the horizontal box
        hbox.pack_start(self.scale, True, True, 0)

        # Add scroll event to the scale
        self.scale.add_events(Gdk.EventMask.SCROLL_MASK)
        self.scale.connect("scroll-event", self.on_scroll_event)

        self.show_all()

    def on_scale_value_changed(self, scale):
        value = scale.get_value()
        self.set_system_volume(int(value))

    def set_system_volume(self, volume):
        subprocess.run(["pamixer", "--set-volume", str(volume)])

    def get_system_volume(self):
        result = subprocess.run(["pamixer", "--get-volume"], stdout=subprocess.PIPE)
        volume = int(result.stdout.decode('utf-8').strip())
        return volume

    def on_scroll_event(self, widget, event):
        if event.direction == Gdk.ScrollDirection.UP:
            self.scale.set_value(self.scale.get_value() + 1)
        elif event.direction == Gdk.ScrollDirection.DOWN:
            self.scale.set_value(self.scale.get_value() - 1)

def main():
    win = VolumeControlWindow()
    win.connect("destroy", Gtk.main_quit)
    Gtk.main()

if __name__ == "__main__":
    main()

