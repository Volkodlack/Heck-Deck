package com.volkodlack.hexdeck;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor "HostService" : démarre / arrête le service au premier plan
 * pendant qu'on héberge une partie (voir client/src/lib/native.ts).
 */
@CapacitorPlugin(name = "HostService")
public class HostServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), HostService.class);
        intent.putExtra(HostService.EXTRA_TEXT, call.getString("text", "Partie en cours"));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Impossible de démarrer le service : " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), HostService.class));
        call.resolve();
    }
}
