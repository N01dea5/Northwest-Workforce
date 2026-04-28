# 91-day rolling fatigue parser upgrade

The downloadable file path was not usable in chat, so the full script should be generated from the latest parser by applying these changes.

## Add fields to `FatigueMetrics`

```python
    rolling_13_week_current_hours: int = 0
    rolling_13_week_max_hours: int = 0
    rolling_13_week_max_period_start: str | None = None
    rolling_13_week_max_period_end: str | None = None
    rolling_13_week_breach_date: str | None = None
    days_to_breach: int | None = None
    even_time_assumed: bool = False
    even_time_assumed_months: list[str] = field(default_factory=list)
```

## Replace `calculate_fatigue_metrics`

```python
def calculate_fatigue_metrics(
    roster: list[RosterRow],
    months: list[date],
    current_month: date,
) -> dict[str, FatigueMetrics]:
    """Calculate worker-level fatigue metrics from daily roster rows.

    Adds true rolling 91-day / 13-week exposure against the SRG 728h rule,
    days-to-breach forecasting, and even-time suppression for artificial
    full-month daily roster patterns.
    """
    from calendar import monthrange

    SRG_13_WEEK_LIMIT = 728
    period_start = months[0]
    period_end = months[-1] + relativedelta(months=1) - relativedelta(days=1)
    current_key = _month_key(current_month)
    today = date.today()

    by_worker: dict[str, dict[date, RosterRow]] = defaultdict(dict)

    for r in roster:
        if r.schedule_date < period_start or r.schedule_date > period_end:
            continue
        if HOURS_PER_SHIFT.get(r.schedule_type, 0) <= 0:
            continue

        existing = by_worker[r.personnel_id].get(r.schedule_date)
        if existing is None:
            by_worker[r.personnel_id][r.schedule_date] = r
        elif r.schedule_type == "Night Shift" and existing.schedule_type != "Night Shift":
            by_worker[r.personnel_id][r.schedule_date] = r

    out: dict[str, FatigueMetrics] = {}

    for pid, day_rows in by_worker.items():
        ordered_dates = sorted(day_rows)
        metrics = FatigueMetrics()
        if not ordered_dates:
            out[pid] = metrics
            continue

        by_month: dict[str, set[date]] = defaultdict(set)
        for d in ordered_dates:
            by_month[_month_key(d)].add(d)

        even_time_months: list[str] = []
        for mk, ds in by_month.items():
            yr, mo = int(mk[:4]), int(mk[5:7])
            _, days_in_month = monthrange(yr, mo)
            if len(ds) >= days_in_month:
                even_time_months.append(mk)

        metrics.even_time_assumed = bool(even_time_months)
        metrics.even_time_assumed_months = sorted(even_time_months)

        adjusted_hours: dict[date, float] = {}
        client_counter: Counter[str] = Counter()

        for d in ordered_dates:
            row = day_rows[d]
            hrs = float(HOURS_PER_SHIFT.get(row.schedule_type, 0))
            if _month_key(d) in even_time_months:
                hrs = hrs / 2
            adjusted_hours[d] = hrs

            if _month_key(d) == current_key:
                client_counter[row.client] += 1
                metrics.hours_current_month += round(hrs)

        if client_counter:
            metrics.current_client = client_counter.most_common(1)[0][0]

        # Current 21-day exposure retained for BHP rule, based on current month end
        current_month_end = current_month + relativedelta(months=1) - relativedelta(days=1)
        rolling_21_start = current_month_end - timedelta(days=20)
        metrics.hours_last_21_days = round(sum(
            hrs for d, hrs in adjusted_hours.items()
            if rolling_21_start <= d <= current_month_end
        ))

        # True rolling 91-day / 13-week exposure.
        max_total = 0.0
        max_start: date | None = None
        max_end: date | None = None
        breach_date: date | None = None

        for d in ordered_dates:
            window_start = d - timedelta(days=90)
            total = sum(
                hrs for dd, hrs in adjusted_hours.items()
                if window_start <= dd <= d
            )

            if total > max_total:
                max_total = total
                max_start = window_start
                max_end = d

            if total >= SRG_13_WEEK_LIMIT and breach_date is None:
                breach_date = d

        current_anchor = min(max(ordered_dates), max(today, current_month))
        current_start = current_anchor - timedelta(days=90)
        metrics.rolling_13_week_current_hours = round(sum(
            hrs for dd, hrs in adjusted_hours.items()
            if current_start <= dd <= current_anchor
        ))
        metrics.rolling_13_week_max_hours = round(max_total)
        metrics.rolling_13_week_max_period_start = max_start.isoformat() if max_start else None
        metrics.rolling_13_week_max_period_end = max_end.isoformat() if max_end else None
        metrics.rolling_13_week_breach_date = breach_date.isoformat() if breach_date else None

        if breach_date:
            metrics.days_to_breach = max((breach_date - today).days, 0)
        else:
            metrics.days_to_breach = None

        # Suppress consecutive-run metrics for artificial full-month even-time roster patterns.
        if not metrics.even_time_assumed:
            run = 0
            day_run = 0
            night_run = 0
            prev: date | None = None

            for d in ordered_dates:
                row = day_rows[d]
                is_consecutive = prev is not None and (d - prev).days == 1
                run = run + 1 if is_consecutive else 1

                if row.schedule_type == "Day Shift":
                    day_run = day_run + 1 if is_consecutive else 1
                    night_run = 0
                elif row.schedule_type == "Night Shift":
                    night_run = night_run + 1 if is_consecutive else 1
                    day_run = 0
                else:
                    day_run = 0
                    night_run = 0

                metrics.max_consecutive_shifts = max(metrics.max_consecutive_shifts, run)
                metrics.max_consecutive_day_shifts = max(metrics.max_consecutive_day_shifts, day_run)
                metrics.max_consecutive_night_shifts = max(metrics.max_consecutive_night_shifts, night_run)
                prev = d

            latest = ordered_dates[-1]
            expected = latest
            current_run = 0
            current_day_run = 0
            current_night_run = 0

            for d in sorted(ordered_dates, reverse=True):
                if d != expected:
                    break

                row = day_rows[d]
                current_run += 1

                if row.schedule_type == "Day Shift":
                    if current_night_run:
                        break
                    current_day_run += 1
                elif row.schedule_type == "Night Shift":
                    if current_day_run:
                        break
                    current_night_run += 1

                expected = d - timedelta(days=1)

            metrics.consecutive_shifts = current_run
            metrics.consecutive_day_shifts = current_day_run
            metrics.consecutive_night_shifts = current_night_run
            metrics.days_on_site_current_run = current_run

        out[pid] = metrics

    return out
```

## Add fields to `worker_payload` export

Inside `fatigueMetrics`, add:

```python
            "rolling13WeekCurrentHours": fm.rolling_13_week_current_hours,
            "rolling13WeekMaxHours": fm.rolling_13_week_max_hours,
            "rolling13WeekMaxPeriodStart": fm.rolling_13_week_max_period_start,
            "rolling13WeekMaxPeriodEnd": fm.rolling_13_week_max_period_end,
            "rolling13WeekBreachDate": fm.rolling_13_week_breach_date,
            "daysToBreach": fm.days_to_breach,
            "evenTimeAssumed": fm.even_time_assumed,
            "evenTimeAssumedMonths": fm.even_time_assumed_months,
```
