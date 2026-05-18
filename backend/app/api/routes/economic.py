from fastapi import APIRouter

from app.services.economic.indicators import EconomicService

router = APIRouter()
eco_service = EconomicService()


@router.get("/indicators")
async def get_indicators():
    """Return key global economic indicators from World Bank (cached 24h)."""
    return await eco_service.get_key_indicators()


@router.get("/forex")
async def get_forex():
    """Return key forex rates relevant to Indian markets (USD/INR, EUR/INR, etc.)."""
    return await eco_service.get_forex_rates()
