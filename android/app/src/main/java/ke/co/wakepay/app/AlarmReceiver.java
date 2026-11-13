package ke.co.wakepay.app;

import android.app.*;
import android.content.*;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {

    public static final String CHANNEL_ID = "wake_pay_alarms";

    @Override
    public void onReceive(Context context, Intent intent) {

        NotificationManager manager =
            (NotificationManager) context.getSystemService(
                Context.NOTIFICATION_SERVICE
            );

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Wake & Pay Alarms",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Scheduled alarm notifications");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }

        Intent alarmIntent = new Intent(context, AlarmActivity.class);
        alarmIntent.putExtra("alarm_id", 1001);

        PendingIntent fullScreen = PendingIntent.getActivity(
            context, 2001, alarmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;

        if (Build.VERSION.SDK_INT >= 26) {
            builder = new Notification.Builder(context, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(context)
                .setPriority(Notification.PRIORITY_MAX);
        }

        Notification notification = builder
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Wake & Pay Kenya")
            .setContentText("Your scheduled alarm is ringing.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(fullScreen)
            .build();

        manager.notify(1001, notification);
    }
}
