
/**
 * 
 * @returns 
 */
export function GetDatesArray(): string[] {
    const today = new Date();

    // snap end to the most recent Sunday
    const end = new Date(today);
    end.setDate(today.getDate() - today.getDay());

    // start 52 weeks before that Sunday
    const start = new Date(end);
    start.setDate(end.getDate() - 52 * 7);

    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= today) {

        let d = cursor.toLocaleString('en-US', { month: 'long', day: 'numeric' });
        // d = d + GetDaySuffix(cursor);
        dates.push(d);
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

export function GetMonthLabelColumns(dates: string[]): { label: string; col: number; colEnd: number }[] {
    const result: { label: string; col: number; colEnd: number }[] = [];
    let lastMonth = '';
    dates.forEach((d, i) => {
        const month = d.split(' ')[0] ?? '';
        if (month !== lastMonth) {
            lastMonth = month;
            const shortMonth = new Date(d + ' 2000').toLocaleString('en-US', { month: 'short' });
            result.push({ label: shortMonth, col: Math.floor(i / 7) + 2, colEnd: 0 });
        }
    });
    // set each month's colEnd to the next month's col start
    for (let i = 0; i < result.length - 1; i++) {
        result[i]!.colEnd = result[i + 1]!.col;
    }
    // last month spans to the end of the grid
    result[result.length - 1]!.colEnd = Math.ceil(dates.length / 7) + 3;
    return result;
}

/**
 * 
 * @returns 
 */
export function GetShortMonthsArray(): string[] {
    return Array.from({ length: 12 }, (_, i) => {
        return new Date(0, i).toLocaleString('en-US', { month: 'short' });
    });
}

/**
 * 
 * @param day 
 * @returns 
 */
export function GetDaySuffix(day: number): string {
    if (day >= 11 && day <= 13) return "th";
    switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}