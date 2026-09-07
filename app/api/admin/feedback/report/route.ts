import { NextRequest, NextResponse } from 'next/server';

import { ApiError, handleApiError } from '@/lib/server/api-error';
import { getRequestAuthContext } from '@/lib/server/request-auth';
import { assertCanViewBuildingFeedback, assertVerifiedAuthentication } from '@/lib/server/route-guards';
import type { FeedbackAnalyticsReport } from '@/lib/feedback/feedback-report';
import {
  generateFeedbackAnalyticsReportPdf,
  getFeedbackAnalyticsReportFilename,
} from '@/lib/feedback/feedback-report-pdf';
import {
  generateFeedbackAnalyticsReportXlsx,
  getFeedbackAnalyticsReportXlsxFilename,
} from '@/lib/feedback/feedback-report-xlsx';
import {
  generateFeedbackAnalyticsReportDocx,
  getFeedbackAnalyticsReportDocxFilename,
} from '@/lib/feedback/feedback-report-docx';

export const runtime = "nodejs";

type FeedbackReportFormat = 'pdf' | 'xlsx' | 'docx';

function isFeedbackReportFormat(value: unknown): value is FeedbackReportFormat {
  return value === 'pdf' || value === 'xlsx' || value === 'docx';
}

function isReportPayload(value: unknown): value is FeedbackAnalyticsReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<FeedbackAnalyticsReport>;
  const scope = report.metadata?.scope;
  return Boolean(
    report.metadata &&
      scope &&
      Array.isArray(scope.buildingIds) &&
      scope.buildingIds.every((id) => typeof id === 'string' && id.length > 0),
  );
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await getRequestAuthContext(request, {
      allowCompatibilityHeaders: false,
    });
    assertVerifiedAuthentication(authContext);

    const body = (await request.json()) as {
      format?: unknown;
      report?: unknown;
    };
    if (!isFeedbackReportFormat(body.format) || !isReportPayload(body.report)) {
      throw new ApiError(400, 'invalid_feedback_report', 'The feedback report request is invalid.');
    }

    for (const buildingId of body.report.metadata.scope.buildingIds) {
      assertCanViewBuildingFeedback(authContext, buildingId);
    }

    const report = body.report;
    if (body.format === 'pdf') {
      const bytes = await generateFeedbackAnalyticsReportPdf(report);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          'Content-Disposition': `attachment; filename="${getFeedbackAnalyticsReportFilename(report)}"`,
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (body.format === 'xlsx') {
      const bytes = generateFeedbackAnalyticsReportXlsx(report);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          'Content-Disposition': `attachment; filename="${getFeedbackAnalyticsReportXlsxFilename(report)}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Cache-Control': 'no-store',
        },
      });
    }

    const bytes = await generateFeedbackAnalyticsReportDocx(report);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Disposition': `attachment; filename="${getFeedbackAnalyticsReportDocxFilename(report)}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
