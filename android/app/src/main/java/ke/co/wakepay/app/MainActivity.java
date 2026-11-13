package ke.co.wakepay.app;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.provider.Settings;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.*;
import java.util.Calendar;

public class MainActivity extends Activity {

    private int hour;
    private int minute;
    private TextView selectedTime;
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Calendar now = Calendar.getInstance();
        now.add(Calendar.MINUTE, 1);
        hour = now.get(Calendar.HOUR_OF_DAY);
        minute = now.get(Calendar.MINUTE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(28, 45, 28, 25);
        root.setBackgroundColor(Color.rgb(13, 24, 43));

        TextView title = new TextView(this);
        title.setText("WAKE & PAY KENYA");
        title.setTextColor(Color.WHITE);
        title.setTextSize(27);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Your morning. Your schedule. Your control.");
        subtitle.setTextColor(Color.LTGRAY);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 12, 0, 35);
        root.addView(subtitle);

        selectedTime = new TextView(this);
        selectedTime.setTextColor(Color.WHITE);
        selectedTime.setTextSize(36);
        selectedTime.setGravity(Gravity.CENTER);
        selectedTime.setPadding(0, 20, 0, 20);
        root.addView(selectedTime);
        updateTime();

        Button choose = new Button(this);
        choose.setText("CHOOSE ALARM TIME");
        root.addView(choose);

        choose.setOnClickListener(v -> {
            new TimePickerDialog(this, (view, h, m) -> {
                hour = h;
                minute = m;
                updateTime();
            }, hour, minute, true).show();
        });

        Button set = new Button(this);
        set.setText("SET MY ALARM");
        set.setTextSize(18);
        set.setPadding(0, 15, 0, 15);
        root.addView(set);

        set.setOnClickListener(v -> scheduleAlarm());

        status = new TextView(this);
        status.setTextColor(Color.rgb(130, 230, 180));
        status.setTextSize(15);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 25, 0, 20);
        root.addView(status);

        TextView notice = new TextView(this);
        notice.setText(
            "DEMO VERSION\n\n" +
            "Snooze and dismiss are test controls. " +
            "M-Pesa payments and remote device activation " +
            "are not connected yet.\n\n" +
            "You remain in control of your phone and can " +
            "use Android emergency and recovery features."
        );
        notice.setTextColor(Color.LTGRAY);
        notice.setGravity(Gravity.CENTER);
        notice.setPadding(5, 25, 5, 10);
        root.addView(notice);

        setContentView(root);
    }

    private void updateTime() {
        selectedTime.setText(
            String.format(java.util.Locale.getDefault(),
                "%02d:%02d", hour, minute)
        );
    }

    private void scheduleAlarm() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                new String[]{"android.permission.POST_NOTIFICATIONS"}, 10
            );
            status.setText("Allow notifications, then set the alarm again.");
            return;
        }

        AlarmManager manager =
            (AlarmManager) getSystemService(ALARM_SERVICE);

        if (Build.VERSION.SDK_INT >= 31 &&
            !manager.canScheduleExactAlarms()) {
            Intent intent = new Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
            status.setText("Allow exact alarms, then return and set again.");
            return;
        }

        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (!nm.canUseFullScreenIntent()) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getPackageName())
                );
                try {
                    startActivity(intent);
                    status.setText("Allow full-screen alarms, then set again.");
                } catch (Exception e) {
                    status.setText("Please check full-screen notification access.");
                }
                return;
            }
        }

        Calendar alarmTime = Calendar.getInstance();
        alarmTime.set(Calendar.HOUR_OF_DAY, hour);
        alarmTime.set(Calendar.MINUTE, minute);
        alarmTime.set(Calendar.SECOND, 0);
        alarmTime.set(Calendar.MILLISECOND, 0);

        if (alarmTime.getTimeInMillis() <= System.currentTimeMillis()) {
            alarmTime.add(Calendar.DAY_OF_YEAR, 1);
        }

        Intent intent = new Intent(this, AlarmReceiver.class);
        intent.putExtra("alarm_id", 1001);

        PendingIntent pending = PendingIntent.getBroadcast(
            this, 1001, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        manager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            alarmTime.getTimeInMillis(),
            pending
        );

        status.setText("Alarm scheduled successfully!");
    }
}
