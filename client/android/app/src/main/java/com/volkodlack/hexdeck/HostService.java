package com.volkodlack.hexdeck;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Service au premier plan actif pendant qu'on HÉBERGE une partie :
 * Android garde l'appli (et donc le moteur de jeu) en vie quand on passe sur une autre appli,
 * pour ne pas figer la partie des autres joueurs.
 */
public class HostService extends Service {
    public static final String EXTRA_TEXT = "text";
    private static final String CHANNEL_ID = "hexdeck_host";
    private static final int NOTIFICATION_ID = 6669;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;
        if (text == null) text = "Partie en cours";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Partie hébergée", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Garde ta partie HEX DECK active quand l'appli est en arrière-plan");
                nm.createNotificationChannel(channel);
            }
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("HEX DECK — tu héberges la partie")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_stat_ghost)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build();

        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        return START_NOT_STICKY;
    }
}
