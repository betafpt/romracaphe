package com.romra.cafe;

import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

import java.io.OutputStream;
import java.net.Socket;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Dang ky Javascript Interface de in Socket TCP truc tiep tu JS
        webView.addJavascriptInterface(new AndroidPrint(), "AndroidPrint");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // Load trang web POS online
        webView.loadUrl("https://romra.cafe");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // Class cau noi Javascript
    public class AndroidPrint {
        @JavascriptInterface
        public void printSocket(final String ip, final int port, final String base64Data) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
                        Socket socket = new Socket(ip, port);
                        // Cau hinh timeout ket noi 5 giay
                        socket.setSoTimeout(5000);
                        OutputStream out = socket.getOutputStream();
                        out.write(data);
                        out.flush();
                        out.close();
                        socket.close();

                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                Toast.makeText(MainActivity.this, "In trực tiếp thành công!", Toast.LENGTH_SHORT).show();
                            }
                        });
                    } catch (final Exception e) {
                        Log.e("RomRaPrint", "Loi in Socket truc tiep", e);
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                Toast.makeText(MainActivity.this, "Lỗi in trực tiếp: " + e.getMessage(), Toast.LENGTH_LONG).show();
                            }
                        });
                    }
                }
            }).start();
        }
    }
}
