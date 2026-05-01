import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'map_provider.dart';

/// Точка на карте-тайлах без 2GIS SDK.
class MapRasterSpot {
  const MapRasterSpot({
    required this.latitude,
    required this.longitude,
    required this.fillColor,
    this.radiusMeters = 52,
  });

  final double latitude;
  final double longitude;
  final Color fillColor;

  /// Оценочный размер круга (метры → пиксели через текущий зум).
  final double radiusMeters;
}

/// Растровые тайлы по HTTPS (по умолчанию [OpenStreetMap](https://www.openstreetmap.org/copyright)).
/// Без бинарного `dgissdk.key` от 2GIS.
///
/// Для векторной карты 2GIS используйте [DgisPlatformMap] и валидный ключ.
class RasterMapFallback extends StatefulWidget {
  const RasterMapFallback({
    super.key,
    required this.cameraLatitude,
    required this.cameraLongitude,
    required this.cameraZoom,
    this.spots = const [],
    this.routePoints = const [],
    this.routeColor,
    this.routeWidthDp = 4,
    this.onMapTap,
    this.bannerLabel = kDefaultInfoBannerRu,
    this.tileUrlTemplate = kDefaultTileServerUrlTemplate,
    this.tileUserAgentPackageName = _defaultTileUserAgent,
    this.myLocation,
  });

  static const String kDefaultInfoBannerRu =
      'Инфо: карта OpenStreetMap по сети (это не ошибка). '
      '2GIS‑вектор — если добавите dgissdk.key. '
      'В BlueStacks координаты часто «фейковые» — задайте их в настройках эмулятора.';

  static const String kDefaultTileServerUrlTemplate =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  /// Идентификатор клиента для политики тайлов OSM.
  static const String _defaultTileUserAgent = 'com.example.taxi_platform_mobile';

  final double cameraLatitude;
  final double cameraLongitude;
  final double cameraZoom;
  final List<MapRasterSpot> spots;
  final List<MapLatLng> routePoints;
  final Color? routeColor;

  final double routeWidthDp;
  final ValueChanged<MapLatLng>? onMapTap;

  final String bannerLabel;
  final String tileUrlTemplate;
  final String tileUserAgentPackageName;

  /// Текущая геопозиция устройства (синяя метка «вы здесь»).
  final MapLatLng? myLocation;

  @override
  State<RasterMapFallback> createState() => _RasterMapFallbackState();
}

class _RasterMapFallbackState extends State<RasterMapFallback> {
  late final MapController _ctrl = MapController();

  LatLng _centerLatLng() => LatLng(widget.cameraLatitude, widget.cameraLongitude);

  @override
  void didUpdateWidget(RasterMapFallback oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.cameraLatitude != widget.cameraLatitude ||
        oldWidget.cameraLongitude != widget.cameraLongitude ||
        oldWidget.cameraZoom != widget.cameraZoom) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _ctrl.move(_centerLatLng(), widget.cameraZoom);
      });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final lineCol = widget.routeColor ?? cs.primary;

    final routeLl = widget.routePoints.map((p) => LatLng(p.latitude, p.longitude)).toList();
    final polylines = <Polyline>[];
    if (routeLl.length >= 2) {
      polylines.add(
        Polyline(
          points: routeLl,
          color: lineCol,
          strokeWidth: widget.routeWidthDp,
        ),
      );
    }

    final circleMarkers = <CircleMarker>[];
    final zoom = widget.cameraZoom.clamp(4.0, 19.0);
    for (final s in widget.spots) {
      final mpp = _mPerPixelApprox(s.latitude, zoom);
      final radiusPx = ((s.radiusMeters / mpp) / 2).clamp(10.0, 46.0);
      circleMarkers.add(
        CircleMarker(
          point: LatLng(s.latitude, s.longitude),
          radius: radiusPx,
          color: s.fillColor.withValues(alpha: s.fillColor.a * 0.55),
          borderStrokeWidth: 2,
          borderColor: Colors.white.withValues(alpha: 0.9),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: cs.secondaryContainer.withValues(alpha: 0.95),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Icon(Icons.map_outlined, size: 18, color: cs.onSecondaryContainer),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.bannerLabel,
                    style: TextStyle(fontSize: 12, height: 1.35, color: cs.onSecondaryContainer),
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: FlutterMap(
            mapController: _ctrl,
            options: MapOptions(
              initialCenter: _centerLatLng(),
              initialZoom: widget.cameraZoom,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
              ),
              onTap: widget.onMapTap == null
                  ? null
                  : (tapPosition, point) {
                      widget.onMapTap!(MapLatLng(point.latitude, point.longitude));
                    },
            ),
            children: [
              TileLayer(
                urlTemplate: widget.tileUrlTemplate,
                userAgentPackageName: widget.tileUserAgentPackageName,
                tileDisplay: const TileDisplay.fadeIn(),
              ),
              if (polylines.isNotEmpty) PolylineLayer(polylines: polylines),
              if (circleMarkers.isNotEmpty) CircleLayer(circles: circleMarkers),
              if (widget.myLocation != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: LatLng(widget.myLocation!.latitude, widget.myLocation!.longitude),
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      child: Tooltip(
                        message: 'Вы здесь',
                        child: Icon(
                          Icons.my_location,
                          color: Colors.blue.shade800,
                          size: 38,
                          shadows: const [
                            Shadow(color: Colors.white, blurRadius: 4),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              const RichAttributionWidget(
                alignment: AttributionAlignment.bottomRight,
                animationConfig: ScaleRAWA(),
                attributions: [
                  TextSourceAttribution('© OpenStreetMap'),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

double _mPerPixelApprox(double latDeg, double zoom) {
  final latRad = latDeg * math.pi / 180;
  return 156543.03 * math.cos(latRad) / math.pow(2.0, zoom);
}
