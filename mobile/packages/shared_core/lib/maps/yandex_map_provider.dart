import 'package:flutter/material.dart';

import 'map_provider.dart';

/// Реальный провайдер Яндекс Карт.
///
/// Использует yandex_maps_mapkit_lite SDK.
/// Инициализация SDK должна быть вызвана ДО создания этого провайдера:
///
/// ```dart
/// import 'package:yandex_maps_mapkit_lite/init.dart' as init;
/// await init.initMapkit(apiKey: config.yandexMapApiKey);
/// ```
///
/// После инициализации SDK используйте виджет YandexMap из пакета:
///
/// ```dart
/// import 'package:yandex_maps_mapkit_lite/yandex_map.dart';
/// ```
class YandexMapProvider extends MapProvider {
  @override
  Widget buildMap({
    required MapCameraPosition initialPosition,
    List<MapMarker> markers = const [],
    List<MapRoute> routes = const [],
    void Function(MapLatLng)? onTap,
    void Function(MapCameraPosition)? onCameraMove,
    bool myLocationEnabled = false,
    bool myLocationButtonEnabled = false,
  }) {
    // После подключения yandex_maps_mapkit_lite замените на:
    // return YandexMap(onMapCreated: (mapWindow) { ... });
    //
    // Пока используется placeholder, который будет заменён при
    // получении API-ключа из кабинета разработчика Яндекс.
    return _YandexMapPlaceholder(
      initialPosition: initialPosition,
      markers: markers,
      routes: routes,
      onTap: onTap,
    );
  }

  @override
  void moveCamera(MapCameraPosition position) {}

  @override
  void animateCamera(MapCameraPosition position, {Duration? duration}) {}

  @override
  void fitBounds(MapLatLng southwest, MapLatLng northeast,
      {double padding = 50}) {}

  @override
  void dispose() {}
}

class _YandexMapPlaceholder extends StatelessWidget {
  const _YandexMapPlaceholder({
    required this.initialPosition,
    this.markers = const [],
    this.routes = const [],
    this.onTap,
  });

  final MapCameraPosition initialPosition;
  final List<MapMarker> markers;
  final List<MapRoute> routes;
  final void Function(MapLatLng)? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapUp: (details) {
        if (onTap != null) {
          final box = context.findRenderObject() as RenderBox;
          final size = box.size;
          final dx = (details.localPosition.dx / size.width - 0.5) * 0.01;
          final dy = (details.localPosition.dy / size.height - 0.5) * -0.01;
          onTap!(MapLatLng(
            initialPosition.latitude + dy,
            initialPosition.longitude + dx,
          ));
        }
      },
      child: Container(
        color: const Color(0xFFE5E3DF),
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.map, size: 48, color: Color(0xFF999999)),
                  const SizedBox(height: 8),
                  const Text(
                    'Яндекс Карты',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF666666),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${initialPosition.latitude.toStringAsFixed(4)}, '
                    '${initialPosition.longitude.toStringAsFixed(4)}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF999999),
                    ),
                  ),
                  if (markers.isNotEmpty)
                    Text(
                      '${markers.length} маркеров',
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF999999),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
