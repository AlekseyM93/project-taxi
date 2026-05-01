/// Совместимость с [OrderReadModel] backend: координаты в `from`/`to` или flat-ключах.

double? orderPickupLat(Map<String, dynamic> json) =>
    _nestedLat(json, 'from') ?? (json['fromLat'] as num?)?.toDouble();

double? orderPickupLng(Map<String, dynamic> json) =>
    _nestedLng(json, 'from') ?? (json['fromLng'] as num?)?.toDouble();

double? orderDropoffLat(Map<String, dynamic> json) =>
    _nestedLat(json, 'to') ?? (json['toLat'] as num?)?.toDouble();

double? orderDropoffLng(Map<String, dynamic> json) =>
    _nestedLng(json, 'to') ?? (json['toLng'] as num?)?.toDouble();

double? _nestedLat(Map<String, dynamic> json, String key) {
  final o = json[key];
  if (o is Map && o['lat'] is num) return (o['lat'] as num).toDouble();
  return null;
}

double? _nestedLng(Map<String, dynamic> json, String key) {
  final o = json[key];
  if (o is Map && o['lng'] is num) return (o['lng'] as num).toDouble();
  return null;
}

double? parseOrderPriceField(dynamic raw) {
  if (raw == null) return null;
  if (raw is num) return raw.toDouble();
  if (raw is String) return double.tryParse(raw);
  return null;
}

/// Короткий id для подписи «Заказ #…» без RangeError на пустой строке.
String shortOrderIdForUi(String id, {int maxLen = 8}) {
  if (id.isEmpty) return '—';
  if (id.length <= maxLen) return id;
  return id.substring(0, maxLen);
}
