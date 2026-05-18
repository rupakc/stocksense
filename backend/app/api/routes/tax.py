import logging
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import User, Holding

router = APIRouter()
logger = logging.getLogger(__name__)

# India tax rules
STCG_RATE = 0.20    # 20% for equity (Budget 2024, applicable from Jul 2024)
LTCG_RATE = 0.125   # 12.5% for equity (Budget 2024)
LTCG_EXEMPTION = 125000  # Rs 1.25 lakh LTCG exemption per year
LONG_TERM_DAYS = 365  # >12 months = long term for equity

@router.get("/report")
async def get_tax_report(
    financial_year: str = Query(default=None, description="e.g., 2025-26"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate capital gains tax report for holdings."""
    # Determine FY dates
    if financial_year:
        try:
            start_year = int(financial_year.split("-")[0])
            fy_start = date(start_year, 4, 1)
            fy_end = date(start_year + 1, 3, 31)
        except (ValueError, IndexError):
            fy_start = date(datetime.now().year, 4, 1)
            fy_end = date(datetime.now().year + 1, 3, 31)
    else:
        now = datetime.now()
        if now.month >= 4:
            fy_start = date(now.year, 4, 1)
            fy_end = date(now.year + 1, 3, 31)
        else:
            fy_start = date(now.year - 1, 4, 1)
            fy_end = date(now.year, 3, 31)

    result = await db.execute(
        select(Holding).where(Holding.user_id == current_user.id)
    )
    holdings = result.scalars().all()

    stcg_entries = []
    ltcg_entries = []
    unrealized = []
    total_stcg = 0
    total_ltcg = 0
    total_unrealized = 0
    today = date.today()

    for h in holdings:
        buy_date = None
        if h.buy_date:
            try:
                buy_date = datetime.strptime(str(h.buy_date)[:10], "%Y-%m-%d").date()
            except ValueError:
                pass

        sell_date_val = None
        sell_price = None
        if hasattr(h, 'sell_date') and h.sell_date:
            try:
                sell_date_val = datetime.strptime(str(h.sell_date)[:10], "%Y-%m-%d").date()
            except ValueError:
                pass
            sell_price = getattr(h, 'sell_price', None)

        if sell_date_val and sell_price:
            # Realized gain
            holding_days = (sell_date_val - buy_date).days if buy_date else 0
            gain = (sell_price - h.buy_price) * h.quantity
            is_long_term = holding_days > LONG_TERM_DAYS

            entry = {
                "symbol": h.symbol,
                "quantity": h.quantity,
                "buy_price": h.buy_price,
                "buy_date": str(buy_date) if buy_date else None,
                "sell_price": sell_price,
                "sell_date": str(sell_date_val),
                "holding_days": holding_days,
                "gain_loss": round(gain, 2),
                "type": "LTCG" if is_long_term else "STCG",
            }
            if is_long_term:
                ltcg_entries.append(entry)
                total_ltcg += gain
            else:
                stcg_entries.append(entry)
                total_stcg += gain
        else:
            # Unrealized
            holding_days = (today - buy_date).days if buy_date else 0
            is_long_term = holding_days > LONG_TERM_DAYS
            unrealized.append({
                "symbol": h.symbol,
                "quantity": h.quantity,
                "buy_price": h.buy_price,
                "buy_date": str(buy_date) if buy_date else None,
                "holding_days": holding_days,
                "type": "LTCG" if is_long_term else "STCG",
                "current_value_note": "Use current market price for unrealized P&L",
            })
            total_unrealized += h.buy_price * h.quantity

    # Tax calculations
    ltcg_taxable = max(0, total_ltcg - LTCG_EXEMPTION)
    stcg_tax = max(0, total_stcg * STCG_RATE) if total_stcg > 0 else 0
    ltcg_tax = ltcg_taxable * LTCG_RATE if ltcg_taxable > 0 else 0

    fy_label = f"{fy_start.year}-{str(fy_end.year)[2:]}"

    return {
        "financial_year": fy_label,
        "summary": {
            "total_stcg": round(total_stcg, 2),
            "total_ltcg": round(total_ltcg, 2),
            "ltcg_exemption": LTCG_EXEMPTION,
            "ltcg_taxable": round(ltcg_taxable, 2),
            "estimated_stcg_tax": round(stcg_tax, 2),
            "estimated_ltcg_tax": round(ltcg_tax, 2),
            "total_estimated_tax": round(stcg_tax + ltcg_tax, 2),
            "stcg_rate": f"{STCG_RATE*100}%",
            "ltcg_rate": f"{LTCG_RATE*100}%",
        },
        "stcg_transactions": stcg_entries,
        "ltcg_transactions": ltcg_entries,
        "unrealized_holdings": unrealized,
        "tax_notes": [
            "STCG (Short Term Capital Gains): Holding period <= 12 months, taxed at 20%",
            "LTCG (Long Term Capital Gains): Holding period > 12 months, taxed at 12.5%",
            f"LTCG exemption: Rs {LTCG_EXEMPTION:,} per financial year",
            "Rates as per Union Budget 2024 (effective from July 23, 2024)",
            "This is an estimate only. Consult a tax professional for actual filing.",
        ],
    }
