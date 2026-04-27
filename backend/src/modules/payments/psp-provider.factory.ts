import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PspProvider } from './psp-provider';
import { MockPspProvider } from './providers/mock-psp.provider';
import { YooKassaPspProvider } from './providers/yookassa-psp.provider';

@Injectable()
export class PspProviderFactory {
  private readonly providersByCode: Record<string, PspProvider>;
  private readonly defaultProviderCode: string;

  constructor(
    private readonly configService: ConfigService,
    mockProvider: MockPspProvider,
    yookassaProvider: YooKassaPspProvider,
  ) {
    this.providersByCode = {
      [mockProvider.providerCode]: mockProvider,
      [yookassaProvider.providerCode]: yookassaProvider,
    };
    this.defaultProviderCode = this.configService
      .get<string>('PAYMENT_PROVIDER', 'MOCK_PSP')
      .trim()
      .toUpperCase();
  }

  getDefaultProvider() {
    return (
      this.providersByCode[this.defaultProviderCode] ??
      this.providersByCode.MOCK_PSP
    );
  }

  getProvider(providerCode?: string | null) {
    const normalized =
      providerCode?.trim().toUpperCase() || this.defaultProviderCode;
    return this.providersByCode[normalized] ?? this.getDefaultProvider();
  }
}
