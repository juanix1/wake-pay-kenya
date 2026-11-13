package ke.co.wakepay.app;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.*;

public class AlarmActivity extends Activity {

    private static final int ALARM_ID = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(28, 30, 28, 30);
        root.setBackgroundColor(Color.rgb(13, 24, 43));

        TextView title = new TextView(this);
        title.setText("TIME TO WAKE UP!");
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView info = new TextView(this);
        info.setText(
            "Your Wake & Pay Kenya alarm is ringing.\n\n" +
            "This is a demonstration. No payment is being charged."
        );
        info.setTextColor(Color.LTGRAY);
        info.setTextSize(17);
        info.setGravity(Gravity.CENTER);
        info.setPadding(0, 30, 0, 40);
        root.addView(info);

        Button snooze = new Button(this);
        snooze.setText("SNOOZE FOR 5 MINUTES");
        root.addView(snooze);

        snooze.setOnClickListener(v -> snoozeAlarm());

        Button dismiss = new Button(this);
        dismiss.setText("DISMISS DEMO ALARM");
        root.addView(dismiss);

        dismiss.setOnClickListener(v -> closeAlarm());

        Button emergency = new Button(this);
        emergency.setText("EMERGENCY / EXIT");
        root.addView(emergency);

        emergency.setOnClickListener(v -> closeAlarm());

        setContentView(root);
    }

    private void snoozeAlarm() {
        AlarmManager manager =
            (AlarmManager) getSystemService(ALARM_SERVICE);

        Intent intent = new Intent(this, AlarmReceiver.class);
        intent.putExtra("alarm_id", ALARM_ID);

        PendingIntent pending = PendingIntent.getBroadcast(
            this, ALARM_ID, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long next = System.currentTimeMillis() + 5 * 60 * 1000L;

        if (Build.VERSION.SDK_INT >= 31 &&
            manager.canScheduleExactAlarms()) {
            manager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, next, pending
            );
        } else {
            manager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, next, pending
            );
        }

        closeAlarm();
    }

    private void closeAlarm() {
        NotificationManager manager =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.cancel(ALARM_ID);
        finish();
    }
}
