package kr.ac.ajou.nisml.dashboard;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Keep the launch destination fixed. Browser handles authentication and session storage. */
public final class DashboardActivity extends LauncherActivity {
    @Override protected Uri getLaunchingUrl() {
        return Uri.parse("https://nisml.ajou.ac.kr/dashboard/");
    }
}
