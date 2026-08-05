package com.petermolnar.readingplan;

import android.app.AlertDialog;
import android.app.Dialog;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;
import static com.petermolnar.readingplan.PlanPrimitives.*;

final class ReadingSessionEntries {
    private final MainActivity activity;
    private final Set<LocalDate> expanded = new HashSet<>();
    ReadingSessionEntries(MainActivity activity) { this.activity = activity; }

    void show() {
        BookSection section = activity.sectionByLabel(activity.selectedBookSection);
        Book initial = selectedBook(section);
        if (initial == null) { showSheet(section, null); return; }
        showSheet(section, initial);
    }

    private Book selectedBook(BookSection section) {
        for (Book book : section.books) if (book.number == activity.selectedSessionBookNumber) return book;
        return section.books.isEmpty() ? null : section.books.get(0);
    }

    private void showSheet(BookSection section, Book selected) {
        Dialog sheet = new Dialog(activity);
        LinearLayout panel = new LinearLayout(activity); panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(activity.dp(20), activity.dp(12), activity.dp(20), activity.dp(20));
        panel.setBackgroundColor(MainActivity.CREAM);
        View handle = new View(activity); handle.setBackground(activity.roundedBackground(MainActivity.BORDER, MainActivity.BORDER));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(activity.dp(44), activity.dp(5)); hp.gravity = Gravity.CENTER_HORIZONTAL; hp.setMargins(0,0,0,activity.dp(12)); panel.addView(handle,hp);
        LinearLayout header = activity.row(); header.addView(activity.heading("Reading history"), new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
        Button close = activity.secondaryButton("Close", v -> dismiss(sheet)); header.addView(close); panel.addView(header);
        if (selected == null) { panel.addView(activity.label("Add a book to record reading history.")); finish(sheet,panel,handle); return; }
        List<String> choices = Book.bookChoices(section); Spinner picker = activity.spinner(choices, selected.number + ". " + selected.title); panel.addView(picker);
        LinearLayout body = activity.verticalBox(); panel.addView(body,new LinearLayout.LayoutParams(-1,0,1));
        picker.setOnItemSelectedListener(new MainActivity.SimpleItemSelectedListener(() -> { int i=picker.getSelectedItemPosition(); if(i>=0&&i<section.books.size()) rebuild(body,sheet,section,section.books.get(i)); }));
        rebuild(body,sheet,section,selected); finish(sheet,panel,handle);
    }

    private void rebuild(LinearLayout body, Dialog sheet, BookSection section, Book book) {
        body.removeAllViews();
        boolean audio=isAudiobookSection(section.label); List<ReadingSession> sessions=new ArrayList<>();
        for(ReadingSession s:book.readingSessions) if(!s.deleted) sessions.add(s);
        Collections.sort(sessions,(a,b)->b.date.compareTo(a.date));
        body.addView(activity.sectionTitle(book.title));
        int current=book.currentPage==null?book.startPage:book.currentPage;
        body.addView(activity.label((audio?"Time left "+formatDuration(remainingTimeAt(book,current)):"Current page "+current)+"  |  "+(book.pagesRead()*100/Math.max(1,book.pages()))+"%  |  total recorded "+(audio?formatDuration(total(sessions)):total(sessions))+"  |  last read "+(sessions.isEmpty()?"-":sessions.get(0).date)));
        if(sessions.isEmpty()){ body.addView(activity.label("No reading entries for this book yet.")); return; }
        Map<LocalDate,List<ReadingSession>> days=new LinkedHashMap<>();
        for(ReadingSession s:sessions) days.computeIfAbsent(s.date,k->new ArrayList<>()).add(s);
        for(Map.Entry<LocalDate,List<ReadingSession>> day:days.entrySet()) {
            List<ReadingSession> daySessions=day.getValue(); LinearLayout card=activity.surfaceCard();
            Button row=activity.secondaryButton(day.getKey()+"  |  "+displayValue(section.label,total(daySessions))+(daySessions.size()>1?"  ("+daySessions.size()+" sessions)":""),v->{if(daySessions.size()>1){if(!expanded.add(day.getKey()))expanded.remove(day.getKey());rebuild(body,sheet,section,book);}}); card.addView(row);
            if(daySessions.size()==1||expanded.contains(day.getKey())) for(ReadingSession s:daySessions) addSession(card,s,section,book,sheet);
            body.addView(card);
        }
    }
    private void addSession(LinearLayout card,ReadingSession s,BookSection section,Book book,Dialog sheet){ card.addView(activity.label((isAudiobookSection(section.label)?"Time left ":"Current page ")+displayValue(section.label,s.currentPage)+"  |  contribution "+displayValue(section.label,s.pagesRead))); LinearLayout actions=activity.row(); actions.addView(activity.secondaryButton("Edit",v->edit(sheet,section,book,s))); actions.addView(activity.secondaryButton("Delete",v->confirmDelete(sheet,section,book,s))); card.addView(actions); }
    private int total(List<ReadingSession> ss){int n=0;for(ReadingSession s:ss)n+=s.pagesRead;return n;}
    private void edit(Dialog sheet, BookSection section, Book book, ReadingSession old){
        LinearLayout box=activity.verticalBox(); EditText date=new EditText(activity); date.setHint("Date (YYYY-MM-DD)"); date.setText(old.date.toString()); EditText pos=new EditText(activity); pos.setHint(isAudiobookSection(section.label)?"Time left":"Current page"); pos.setText(displayValue(section.label, isAudiobookSection(section.label)?remainingTimeAt(book,old.currentPage):old.currentPage)); box.addView(date);box.addView(pos);
        AlertDialog d=new AlertDialog.Builder(activity).setTitle("Edit session").setView(box).setPositiveButton("Save",(x,w)->{try{LocalDate nd=parseDate(date.getText().toString().trim());int value;if(isAudiobookSection(section.label)){int remaining=parseDuration(pos.getText().toString().trim());value=currentTimeFromRemaining(book,remaining);}else{value=Integer.parseInt(pos.getText().toString().trim());if(value<book.startPage||value>book.endPage)throw new IllegalArgumentException("value outside book range");}replaceAndRecalculate(book,old,nd,value);activity.afterStateChange("Session updated");sheet.dismiss();show();}catch(Exception e){activity.showError(e.getMessage());}}).setNegativeButton("Cancel",null).create(); d.show();
    }
    private void replaceAndRecalculate(Book book,ReadingSession old,LocalDate date,int page){for(int i=0;i<book.readingSessions.size();i++)if(book.readingSessions.get(i)==old)book.readingSessions.set(i,new ReadingSession(old.id,date,page,old.pagesRead,false));recalculate(book, activity.selectedBookSection);}
    private void recalculate(Book book,String sectionLabel){List<Integer> indexes=new ArrayList<>();for(int i=0;i<book.readingSessions.size();i++)if(!book.readingSessions.get(i).deleted)indexes.add(i);Collections.sort(indexes,(a,b)->book.readingSessions.get(a).date.compareTo(book.readingSessions.get(b).date));int previous=0;for(int index:indexes){ReadingSession s=book.readingSessions.get(index);int completed=isAudiobookSection(sectionLabel)?Math.max(s.currentPage-book.startPage,0):Math.max(s.currentPage-book.startPage+1,0);int contribution=Math.max(0,completed-previous);book.readingSessions.set(index,new ReadingSession(s.id,s.date,s.currentPage,contribution,false));previous=completed;}book.currentPage=indexes.isEmpty()?null:book.readingSessions.get(indexes.get(indexes.size()-1)).currentPage;}
    private void confirmDelete(Dialog sheet,BookSection section,Book book,ReadingSession s){new AlertDialog.Builder(activity).setTitle("Delete entry?").setMessage("This session will be removed and progress recalculated.").setPositiveButton("Delete",(d,w)->{for(int i=0;i<book.readingSessions.size();i++)if(book.readingSessions.get(i)==s){activity.removeReadingSession(book,i);break;}recalculate(book,section.label);activity.afterStateChange("Session deleted");sheet.dismiss();show();}).setNegativeButton("Cancel",null).show();}
    private void finish(Dialog d,LinearLayout p,View handle){d.setContentView(p);Window w=d.getWindow();if(w!=null){w.setBackgroundDrawable(new ColorDrawable(MainActivity.CREAM));w.setGravity(Gravity.BOTTOM);}d.show();if(d.getWindow()!=null)d.getWindow().setLayout(-1,(int)(activity.getResources().getDisplayMetrics().heightPixels*.86f));drag(d,p,handle);}
    private void drag(Dialog d,View root,View handle){final float[] y={0};View.OnTouchListener l=(v,e)->{if(e.getAction()==MotionEvent.ACTION_DOWN){y[0]=e.getRawY();return true;}if(e.getAction()==MotionEvent.ACTION_MOVE){float dy=Math.max(0,e.getRawY()-y[0]);root.setTranslationY(dy);return true;}if(e.getAction()==MotionEvent.ACTION_UP){if(e.getRawY()-y[0]>activity.dp(120))dismiss(d);else root.animate().translationY(0).setDuration(180).start();return true;}return true;};handle.setOnTouchListener(l);}
    private void dismiss(Dialog d){d.getWindow().getDecorView().animate().translationY(d.getWindow().getDecorView().getHeight()).setDuration(180).withEndAction(d::dismiss).start();}
}
