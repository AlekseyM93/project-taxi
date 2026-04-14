import { Injectable } from '@nestjs/common';

@Injectable()
export class AntifraudService {
  evaluateCreateOrderRisk(params: {
    passengerId: string;
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    price: number;
  }) {
    const maxPriceRub = Number(process.env.RISK_MAX_ORDER_PRICE_RUB || 15000);
    const decisionTraceId = `risk_${Date.now().toString(36)}`;
    const reasons: string[] = [];

    if (
      Math.abs(params.fromLat) > 90 ||
      Math.abs(params.toLat) > 90 ||
      Math.abs(params.fromLng) > 180 ||
      Math.abs(params.toLng) > 180
    ) {
      reasons.push('INVALID_COORDINATES');
    }
    if (params.price > maxPriceRub) {
      reasons.push('PRICE_LIMIT_EXCEEDED');
    }

    return {
      decision: reasons.length === 0 ? ('ALLOW' as const) : ('REJECT' as const),
      reasons,
      score: reasons.length === 0 ? 0.08 : 0.92,
      traceId: decisionTraceId,
    };
  }
}
