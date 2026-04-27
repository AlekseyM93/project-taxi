import 'package:flutter/material.dart';

import 'map_provider.dart';

class PlaceholderMapProvider extends MapProvider {
  // ignore: unused_field
  MapCameraPosition _currentPosition = const MapCameraPosition(
    latitude: 55.7558,
    longitude: 37.6173,
  );

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
    _currentPosition = initialPosition;

    return GestureDetector(
      onTapUp: (details) {
        if (onTap != null) {
          onTap(MapLatLng(
            initialPosition.latitude + (details.localPosition.dy - 200) * 0.0001,
            initialPosition.longitude + (details.localPosition.dx - 200) * 0.0001,
          ));
        }
      },
      child: Container(
        color: const Color(0xFFE8E8E8),
        child: Stack(
          children: [
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.map, size: 64, color: Color(0xFFBBBBBB)),
                  const SizedBox(height: 8),
                  Text(
                    'Карта (Yandex MapKit)\n${initialPosition.latitude.toStringAsFixed(4)}, ${initialPosition.longitude.toStringAsFixed(4)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF888888), fontSize: 12),
                  ),
                  if (markers.isNotEmpty)
                    Text(
                      '${markers.length} маркеров',
                      style: const TextStyle(color: Color(0xFF888888), fontSize: 11),
                    ),
                  if (routes.isNotEmpty)
                    Text(
                      '${routes.length} маршрутов',
                      style: const TextStyle(color: Color(0xFF888888), fontSize: 11),
                    ),
                ],
              ),
            ),
            ...markers.map((marker) => Positioned(
              left: 20.0 * markers.indexOf(marker) + 10,
              top: 20.0 * markers.indexOf(marker) + 10,
              child: Icon(
                Icons.location_on,
                color: marker.color ?? Colors.red,
                size: 24,
              ),
            )),
          ],
        ),
      ),
    );
  }

  @override
  void moveCamera(MapCameraPosition position) {
    _currentPosition = position;
  }

  @override
  void animateCamera(MapCameraPosition position, {Duration? duration}) {
    _currentPosition = position;
  }

  @override
  void fitBounds(MapLatLng southwest, MapLatLng northeast, {double padding = 50}) {
    _currentPosition = MapCameraPosition(
      latitude: (southwest.latitude + northeast.latitude) / 2,
      longitude: (southwest.longitude + northeast.longitude) / 2,
    );
  }

  @override
  void dispose() {}
}
