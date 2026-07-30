import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense } from "@/lib/models";
import { toJSON, toJSONList } from "@/lib/serialize";

function mapExpense(e: Record<string, unknown>) {
  return {
    ...e,
    date: e.date ? new Date(e.date as string).toISOString().slice(0, 10) : null,
  };
}

export async function GET() {
  try {
    await connectDB();
    const expenses = await Expense.find().sort({ date: -1 });
    return NextResponse.json(toJSONList(expenses).map(mapExpense));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load expenses" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json();
    const expense = await Expense.create({
      ...body,
      date: new Date(body.date || Date.now()),
      status: body.status || "pending",
    });
    return NextResponse.json(mapExpense(toJSON(expense)!), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create expense" },
      { status: 400 },
    );
  }
}
