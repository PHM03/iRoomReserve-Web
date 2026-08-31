'use client';

import { useMemo, useState } from 'react';
import type { Feedback } from '@/lib/feedback/feedback';
import {
  buildSentimentTrend,
  SENTIMENT_TREND_PERIODS,
  type SentimentTrendPeriod,
  type SentimentTrendBucket,
} from '@/lib/feedback/feedback-trend';
import {
  DEFAULT_SCHEDULE_CONTEXT,
  SCHEDULE_ACADEMIC_YEARS,
  SCHEDULE_SEMESTERS,
  type ScheduleAcademicYear,
  type ScheduleSemester,
} from '@/lib/schedules/scheduleContext';

function getTrendPath(
  buckets: SentimentTrendBucket[],
  width: number,
  height: number,
  value: (bucket: SentimentTrendBucket) => number | null,
) {
  const points = buckets.map((bucket, index) => {
    const metric = value(bucket);
    if (metric === null || bucket.totalReviews === 0) {
      return null;
    }

    const x = buckets.length === 1 ? width / 2 : (index / (buckets.length - 1)) * width;
    const y = height - (metric / 100) * height;
    return `${x.toFixed(2)},${Math.max(0, Math.min(height, y)).toFixed(2)}`;
  });

  const paths: string[] = [];
  let currentPath: string[] = [];
  points.forEach((point) => {
    if (point === null) {
      if (currentPath.length > 0) {
        paths.push(currentPath.join(' L '));
        currentPath = [];
      }
      return;
    }

    currentPath.push(point);
  });
  if (currentPath.length > 0) {
    paths.push(currentPath.join(' L '));
  }

  return paths.map((path) => `M ${path}`).join(' ');
}

function SentimentTrendChart({ buckets }: { buckets: SentimentTrendBucket[] }) {
  const chartWidth = 720;
  const chartHeight = 210;
  const chartLeft = 44;
  const chartTop = 18;
  const chartBottom = 44;
  const plotWidth = chartWidth - chartLeft - 12;
  const plotHeight = chartHeight - chartTop - chartBottom;
  const positivePath = getTrendPath(buckets, plotWidth, plotHeight, (bucket) => bucket.positiveRate);
  const negativePath = getTrendPath(buckets, plotWidth, plotHeight, (bucket) => bucket.negativeRate);
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Sentiment Trend line chart"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-auto min-w-[620px] w-full"
        >
          {yTicks.map((tick) => {
            const y = chartTop + plotHeight - (tick / 100) * plotHeight;
            return (
              <g key={tick}>
                <line
                  x1={chartLeft}
                  x2={chartWidth - 12}
                  y1={y}
                  y2={y}
                  className="stroke-black/10"
                  strokeDasharray="3 4"
                />
                <text
                  x={chartLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-black/50 text-[10px] font-bold"
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          <line x1={chartLeft} x2={chartLeft} y1={chartTop} y2={chartTop + plotHeight} className="stroke-black/20" />
          <line
            x1={chartLeft}
            x2={chartWidth - 12}
            y1={chartTop + plotHeight}
            y2={chartTop + plotHeight}
            className="stroke-black/20"
          />

          <g transform={`translate(${chartLeft}, ${chartTop})`}>
            {positivePath ? (
              <path
                d={positivePath}
                fill="none"
                className="stroke-emerald-600"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {negativePath ? (
              <path
                d={negativePath}
                fill="none"
                className="stroke-red-600"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {buckets.map((bucket, index) => {
              const x = buckets.length === 1 ? plotWidth / 2 : (index / (buckets.length - 1)) * plotWidth;

              return (
                <g key={bucket.key}>
                  {bucket.totalReviews > 0 ? (
                    <circle
                      cx={x}
                      cy={plotHeight - (bucket.positiveRate / 100) * plotHeight}
                      r="4.5"
                      className="fill-emerald-600 stroke-white"
                      strokeWidth="2"
                      tabIndex={0}
                    >
                      <title>
                        {`${bucket.label}: ${bucket.positiveRate.toFixed(1)}% positive, ${bucket.negativeRate.toFixed(1)}% negative (${bucket.totalReviews} reviews)`}
                      </title>
                    </circle>
                  ) : null}
                  <text
                    x={x}
                    y={plotHeight + 28}
                    textAnchor="middle"
                    className="fill-black/55 text-[10px] font-bold"
                    transform={`rotate(${buckets.length > 7 ? -35 : 0} ${x} ${plotHeight + 28})`}
                  >
                    {bucket.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 text-[10px] font-bold text-black/55">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />Positive %</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />Negative %</span>
        <span className="text-black/40">Average VADER remains available in the bucket data.</span>
      </div>
    </div>
  );
}

export default function SentimentTrendSection({
  feedbackList,
  period: controlledPeriod,
  scheduleContext,
  hideControls = false,
}: Readonly<{
  feedbackList: Feedback[];
  period?: SentimentTrendPeriod;
  scheduleContext?: { academicYear: ScheduleAcademicYear; semester: ScheduleSemester };
  hideControls?: boolean;
}>) {
  const [periodState, setPeriod] = useState<SentimentTrendPeriod>('weekly');
  const [academicYear, setAcademicYear] = useState<ScheduleAcademicYear>(
    DEFAULT_SCHEDULE_CONTEXT.academicYear,
  );
  const [semester, setSemester] = useState<ScheduleSemester>(
    DEFAULT_SCHEDULE_CONTEXT.semester,
  );
  const [analyticsNow] = useState(() => new Date());
  const period = controlledPeriod ?? periodState;
  const trend = useMemo(
    () => buildSentimentTrend(
      feedbackList,
      period,
      analyticsNow,
      scheduleContext ?? { academicYear, semester },
    ),
    [academicYear, analyticsNow, feedbackList, period, scheduleContext, semester],
  );

  return (
    <div className="glass-card mb-4 p-4">
       <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-extrabold text-black">Room Analytics</p>
          <p className="mt-1 max-w-2xl text-xs text-black/55">
            Positive and negative review rates over feedback submission time. Average VADER remains available as supporting data.
          </p>
        </div>
        {!hideControls && !controlledPeriod ? <label className="flex items-center gap-2 text-xs font-bold text-black/60">
          <span className="whitespace-nowrap">Period:</span>
          <select
            aria-label="Room analytics period"
            value={period}
            onChange={(event) => setPeriod(event.target.value as SentimentTrendPeriod)}
            className="glass-input h-9 px-3 text-xs font-bold text-black"
          >
            {SENTIMENT_TREND_PERIODS.map((option) => (
              <option key={option} value={option}>
                {option === 'all_time'
                  ? 'All Time'
                  : option[0].toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label> : null}
        {!hideControls && !controlledPeriod && period === 'semester' ? (
          <>
            <label className="flex items-center gap-2 text-xs font-bold text-black/60">
              <span className="whitespace-nowrap">Academic Year:</span>
              <select
                aria-label="Room analytics academic year"
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value as ScheduleAcademicYear)}
                className="glass-input h-9 px-3 text-xs font-bold text-black"
              >
                {SCHEDULE_ACADEMIC_YEARS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-black/60">
              <span className="whitespace-nowrap">Semester:</span>
              <select
                aria-label="Room analytics semester"
                value={semester}
                onChange={(event) => setSemester(event.target.value as ScheduleSemester)}
                className="glass-input h-9 px-3 text-xs font-bold text-black"
              >
                {SCHEDULE_SEMESTERS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-dark/10 bg-white/55 p-3 sm:p-4">
        <p className="text-sm font-extrabold text-black">Sentiment Trend</p>
        <p className="mt-1 text-xs text-black/55">
           Positive and negative review rates for each {period === 'weekly' ? 'day' : period === 'monthly' || period === 'semester' ? 'week' : 'month'} in the selected period.
        </p>
        <div className="mt-3">
          {!trend.configured ? (
            <p className="dashboard-empty-state rounded-xl px-3 py-8 text-center text-xs text-black/55">
              {trend.message}
            </p>
           ) : trend.buckets.length === 0 || trend.buckets.every((bucket) => bucket.totalReviews === 0) ? (
            <>
              {trend.buckets.length > 0 ? <SentimentTrendChart buckets={trend.buckets} /> : null}
              <p className="dashboard-empty-state mt-2 rounded-xl px-3 py-3 text-center text-xs text-black/55">
                 No feedback available for the selected filters.
              </p>
            </>
          ) : (
            <SentimentTrendChart buckets={trend.buckets} />
          )}
        </div>
      </div>
    </div>
  );
}
