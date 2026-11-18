package com.volkodlack.hexdeck;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin maison : garde la partie hébergée active en arrière-plan
        registerPlugin(HostServicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
