import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import {
  listStudentLogins,
  requireStudentLoginsAdmin,
} from "@/lib/student-accounts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireStudentLoginsAdmin(request);
    if (!auth.ok) return auth.response;

    const params = request.nextUrl.searchParams;
    const data = await listStudentLogins({
      search: params.get("search") ?? "",
      filter: params.get("filter") ?? "all",
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 25),
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Could not load student logins.") },
      { status: 500 },
    );
  }
}
