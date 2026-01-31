// public/js/modules/calendar.js

export class CalendarExporter {
    
    // Googleカレンダー登録URLを開く
    static openGoogleCalendar(plans, date, note) {
        if (!plans.length) return alert("プランが空です");
        
        const title = `旅プラン: ${plans[0].spotName} ほか`;
        const details = this._createDescription(plans, note);
        const location = `${plans[0].spotName} (${plans[0].prefecture})`;
        
        // 日付が決まっていればその日、なければ明日
        const startDate = date ? new Date(date) : new Date(Date.now() + 86400000);
        const startStr = this._formatDateForGoogle(startDate);
        const endStr = this._formatDateForGoogle(startDate); // 終日扱いで同じ日

        const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&dates=${startStr}/${endStr}`;
        
        window.open(url, '_blank');
    }

    // iPhone/Outlook用 (.icsファイル) をダウンロード
    static downloadIcs(plans, date, note) {
        if (!plans.length) return alert("プランが空です");

        const title = `旅プラン: ${plans[0].spotName} ほか`;
        const description = this._createDescription(plans, note);
        const targetDate = date ? new Date(date) : new Date(Date.now() + 86400000);
        const dateStr = this._formatDateForIcs(targetDate);

        // .icsフォーマットのテキスト作成
        const icsContent = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//TripPlanner//JP",
            "BEGIN:VEVENT",
            `SUMMARY:${title}`,
            `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
            `DTSTART;VALUE=DATE:${dateStr}`,
            `DTEND;VALUE=DATE:${dateStr}`,
            `LOCATION:${plans[0].spotName}`,
            "END:VEVENT",
            "END:VCALENDAR"
        ].join("\r\n");

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'trip_plan.ics';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- 内部ヘルパー ---

    static _createDescription(plans, note) {
        let desc = "【旅のしおり】\n";
        plans.forEach((p, i) => {
            desc += `${i + 1}. ${p.spotName}\n`;
        });
        if (note) {
            desc += `\n【メモ】\n${note}`;
        }
        return desc;
    }

    static _formatDateForGoogle(date) {
        return date.toISOString().replace(/-|:|\.\d\d\d/g, "").slice(0, 8);
    }

    static _formatDateForIcs(date) {
        // YYYYMMDD形式
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }
}