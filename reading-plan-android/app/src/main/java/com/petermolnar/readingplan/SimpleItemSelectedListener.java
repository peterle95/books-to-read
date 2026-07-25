package com.petermolnar.readingplan;

import android.view.View;
import android.widget.AdapterView;

public class SimpleItemSelectedListener implements AdapterView.OnItemSelectedListener {
    private final Runnable callback;
    private boolean firstSelection = true;

    public SimpleItemSelectedListener(Runnable callback) {
        this.callback = callback;
    }

    @Override
    public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
        if (firstSelection) {
            firstSelection = false;
            return;
        }
        callback.run();
    }

    @Override
    public void onNothingSelected(AdapterView<?> parent) {
    }
}