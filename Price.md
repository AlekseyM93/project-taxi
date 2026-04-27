Ты senior pricing architect, monetization strategist, senior backend architect и senior product engineer для production-grade taxi platform уровня Яндекс Такси, Uber и Bolt.

Контекст проекта:
- backend: NestJS + TypeScript
- database: PostgreSQL + PostGIS
- cache/realtime: Redis + Socket.IO
- есть multi-city foundation
- есть serviceLevel: ECONOMY / COMFORT / BUSINESS
- сейчас существует старая тарифная система, ее нужно полностью удалить и заменить новой
- старая логика тарифов, старые seed'ы, старые hardcoded значения, старые pricing calculators и старые конфиги должны быть полностью удалены
- новая система должна быть admin-ready, чтобы тарифы можно было менять по городам без изменения кода
- не присылай фрагменты
- присылай полностью готовые файлы
- после кода всегда присылай полный сценарий тестирования с начала до конца

Задача:
Полностью заменить старую тарифную систему на новую multi-city pricing architecture.

Нужно реализовать 5 city tiers:

- CITY_TIER_A = Москва
- CITY_TIER_B = Санкт-Петербург и дорогие агломерации
- CITY_TIER_C = миллионники
- CITY_TIER_D = средние города
- CITY_TIER_E = малые города и спутники

Нужно создать и использовать новую структуру tariffs со следующими полями:

- cityId
- serviceLevel
- fareBaseRub
- farePerKmRub
- farePerMinuteRub
- minFareRub
- includedKm
- includedMinutes
- freeWaitingSeconds
- waitingPerMinuteRub
- cancelFeeRub
- noShowFeeRub
- outOfCityPerKmRub
- airportSurchargeRub
- childSeatRub
- petRub
- extraStopRub
- maxSurgeMultiplier
- commissionPercent
- minimumPlatformFeeRub

Реализовать следующую тарифную сетку.

CITY_TIER_A

ECONOMY:
- fareBaseRub=159
- farePerKmRub=14
- farePerMinuteRub=12
- minFareRub=179
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=12
- cancelFeeRub=79
- noShowFeeRub=129
- outOfCityPerKmRub=20
- airportSurchargeRub=150
- childSeatRub=150
- petRub=100
- extraStopRub=100
- maxSurgeMultiplier=2.0
- commissionPercent=14
- minimumPlatformFeeRub=45

COMFORT:
- fareBaseRub=199
- farePerKmRub=16
- farePerMinuteRub=14
- minFareRub=229
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=14
- cancelFeeRub=99
- noShowFeeRub=149
- outOfCityPerKmRub=24
- airportSurchargeRub=200
- childSeatRub=150
- petRub=120
- extraStopRub=100
- maxSurgeMultiplier=2.2
- commissionPercent=15
- minimumPlatformFeeRub=55

BUSINESS:
- fareBaseRub=349
- farePerKmRub=24
- farePerMinuteRub=20
- minFareRub=399
- includedKm=2
- includedMinutes=5
- freeWaitingSeconds=300
- waitingPerMinuteRub=18
- cancelFeeRub=149
- noShowFeeRub=199
- outOfCityPerKmRub=35
- airportSurchargeRub=300
- childSeatRub=0
- petRub=200
- extraStopRub=100
- maxSurgeMultiplier=2.5
- commissionPercent=17
- minimumPlatformFeeRub=80

CITY_TIER_B

ECONOMY:
- fareBaseRub=139
- farePerKmRub=13
- farePerMinuteRub=10
- minFareRub=159
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=10
- cancelFeeRub=69
- noShowFeeRub=109
- outOfCityPerKmRub=18
- airportSurchargeRub=120
- childSeatRub=120
- petRub=80
- extraStopRub=80
- maxSurgeMultiplier=1.9
- commissionPercent=13
- minimumPlatformFeeRub=35

COMFORT:
- fareBaseRub=179
- farePerKmRub=15
- farePerMinuteRub=12
- minFareRub=209
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=12
- cancelFeeRub=89
- noShowFeeRub=129
- outOfCityPerKmRub=22
- airportSurchargeRub=180
- childSeatRub=140
- petRub=100
- extraStopRub=90
- maxSurgeMultiplier=2.0
- commissionPercent=14
- minimumPlatformFeeRub=45

BUSINESS:
- fareBaseRub=299
- farePerKmRub=22
- farePerMinuteRub=18
- minFareRub=359
- includedKm=2
- includedMinutes=5
- freeWaitingSeconds=300
- waitingPerMinuteRub=16
- cancelFeeRub=129
- noShowFeeRub=179
- outOfCityPerKmRub=30
- airportSurchargeRub=250
- childSeatRub=0
- petRub=150
- extraStopRub=100
- maxSurgeMultiplier=2.3
- commissionPercent=16
- minimumPlatformFeeRub=70

CITY_TIER_C

ECONOMY:
- fareBaseRub=79
- farePerKmRub=11
- farePerMinuteRub=7
- minFareRub=89
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=8
- cancelFeeRub=49
- noShowFeeRub=79
- outOfCityPerKmRub=14
- airportSurchargeRub=80
- childSeatRub=100
- petRub=70
- extraStopRub=60
- maxSurgeMultiplier=1.8
- commissionPercent=12
- minimumPlatformFeeRub=25

COMFORT:
- fareBaseRub=99
- farePerKmRub=13
- farePerMinuteRub=8
- minFareRub=119
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=10
- cancelFeeRub=59
- noShowFeeRub=89
- outOfCityPerKmRub=16
- airportSurchargeRub=100
- childSeatRub=120
- petRub=80
- extraStopRub=70
- maxSurgeMultiplier=2.0
- commissionPercent=13
- minimumPlatformFeeRub=30

BUSINESS:
- fareBaseRub=229
- farePerKmRub=18
- farePerMinuteRub=11
- minFareRub=279
- includedKm=1.5
- includedMinutes=4
- freeWaitingSeconds=240
- waitingPerMinuteRub=14
- cancelFeeRub=99
- noShowFeeRub=149
- outOfCityPerKmRub=24
- airportSurchargeRub=150
- childSeatRub=0
- petRub=120
- extraStopRub=90
- maxSurgeMultiplier=2.2
- commissionPercent=15
- minimumPlatformFeeRub=55

CITY_TIER_D

ECONOMY:
- fareBaseRub=69
- farePerKmRub=10
- farePerMinuteRub=6
- minFareRub=79
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=7
- cancelFeeRub=39
- noShowFeeRub=69
- outOfCityPerKmRub=12
- airportSurchargeRub=50
- childSeatRub=80
- petRub=50
- extraStopRub=50
- maxSurgeMultiplier=1.7
- commissionPercent=11
- minimumPlatformFeeRub=22

COMFORT:
- fareBaseRub=89
- farePerKmRub=12
- farePerMinuteRub=7
- minFareRub=109
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=8
- cancelFeeRub=49
- noShowFeeRub=79
- outOfCityPerKmRub=14
- airportSurchargeRub=70
- childSeatRub=100
- petRub=60
- extraStopRub=60
- maxSurgeMultiplier=1.8
- commissionPercent=12
- minimumPlatformFeeRub=25

BUSINESS:
- fareBaseRub=199
- farePerKmRub=16
- farePerMinuteRub=10
- minFareRub=249
- includedKm=1.5
- includedMinutes=4
- freeWaitingSeconds=240
- waitingPerMinuteRub=12
- cancelFeeRub=79
- noShowFeeRub=119
- outOfCityPerKmRub=20
- airportSurchargeRub=120
- childSeatRub=0
- petRub=100
- extraStopRub=80
- maxSurgeMultiplier=2.0
- commissionPercent=14
- minimumPlatformFeeRub=45

CITY_TIER_E

ECONOMY:
- fareBaseRub=75
- farePerKmRub=9
- farePerMinuteRub=5
- minFareRub=95
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=120
- waitingPerMinuteRub=8
- cancelFeeRub=29
- noShowFeeRub=49
- outOfCityPerKmRub=10
- airportSurchargeRub=0
- childSeatRub=80
- petRub=50
- extraStopRub=40
- maxSurgeMultiplier=1.6
- commissionPercent=10
- minimumPlatformFeeRub=20

COMFORT:
- fareBaseRub=95
- farePerKmRub=11
- farePerMinuteRub=6
- minFareRub=115
- includedKm=1
- includedMinutes=3
- freeWaitingSeconds=180
- waitingPerMinuteRub=10
- cancelFeeRub=39
- noShowFeeRub=59
- outOfCityPerKmRub=12
- airportSurchargeRub=0
- childSeatRub=100
- petRub=70
- extraStopRub=50
- maxSurgeMultiplier=1.8
- commissionPercent=11
- minimumPlatformFeeRub=25

BUSINESS:
- fareBaseRub=179
- farePerKmRub=15
- farePerMinuteRub=9
- minFareRub=229
- includedKm=1.5
- includedMinutes=4
- freeWaitingSeconds=240
- waitingPerMinuteRub=14
- cancelFeeRub=69
- noShowFeeRub=99
- outOfCityPerKmRub=18
- airportSurchargeRub=0
- childSeatRub=0
- petRub=100
- extraStopRub=80
- maxSurgeMultiplier=2.0
- commissionPercent=13
- minimumPlatformFeeRub=40

Реализовать формулу расчета:

finalPrice =
max(
  minFareRub,
  fareBaseRub +
  max(0, routeKm - includedKm) * farePerKmRub +
  max(0, routeMinutes - includedMinutes) * farePerMinuteRub
)
+ waitingChargeRub
+ airportSurchargeRub
+ extraStopRub
+ childSeatRub
+ petRub
+ outOfCityChargeRub

После этого:
- применять surgeMultiplier
- не превышать maxSurgeMultiplier
- применять minimumPlatformFeeRub
- считать platformFeeRub
- считать driverGrossIncomeRub
- считать selfEmploymentTaxRub = 4%
- считать driverNetIncomeRub

Вернуть полный breakdown:

- totalPriceRub
- platformFeeRub
- driverGrossIncomeRub
- selfEmploymentTaxRub
- driverNetIncomeRub
- waitingChargeRub
- airportChargeRub
- childSeatChargeRub
- petChargeRub
- extraStopChargeRub
- outOfCityChargeRub
- appliedSurgeMultiplier

Дополнительные требования:
- не упрощай архитектуру
- не оставляй TODO
- не используй mock-значения
- не используй hardcoded значения вне seed-конфигов
- все тарифы должны храниться в БД
- все расчеты должны быть покрыты unit tests
- все сценарии должны быть покрыты e2e tests
- подготовь систему так, чтобы новые города и новые тарифы можно было добавлять без изменения бизнес-логики
- полностью удали старую тарифную систему перед внедрением новой