import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

import '../../order/presentation/order_tracking_screen.dart';
import '../../history/presentation/order_history_screen.dart';
import '../../profile/presentation/passenger_profile_screen.dart';
import '../domain/passenger_order_repository.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({
    super.key,
    required this.orderRepository,
    required this.locationService,
    required this.authRepository,
    this.dgisSession,
    this.passengerRealtime,
    this.syncService,
  });

  final PassengerOrderRepository orderRepository;
  final LocationService locationService;
  final AuthRepository authRepository;

  /// Сессия 2GIS после [DgisSession.tryInitialize]; при `null` показывается заглушка.
  final DgisSession? dgisSession;
  final PassengerRealtimeService? passengerRealtime;
  final SyncService? syncService;

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen> {
  LocationData? _currentLocation;
  GeoPoint? _pickup;
  GeoPoint? _dropoff;
  RouteEstimate? _routeEstimate;
  FareEstimate? _fareEstimate;
  OrderDetails? _activeOrder;
  bool _isLoading = false;
  String? _error;
  String _selectingPoint = 'pickup';

  StreamSubscription<OrderStatusEvent>? _orderStatusSub;
  StreamSubscription<DriverLocationUpdate>? _driverLocSub;
  StreamSubscription<DriverSnapshotEvent>? _driverSnapSub;
  String? _realtimeWiredOrderId;
  double? _driverLat;
  double? _driverLng;

  final TextEditingController _pickupAddressCtrl = TextEditingController();
  final TextEditingController _dropoffAddressCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    _pickupAddressCtrl.dispose();
    _dropoffAddressCtrl.dispose();
    _detachPassengerRealtime();
    super.dispose();
  }

  void _syncAddressFieldsFromGeoPoints() {
    final pu = _pickup;
    final dr = _dropoff;
    if (pu != null) {
      _pickupAddressCtrl.text = pu.address ?? '${pu.latitude}, ${pu.longitude}';
    }
    if (dr != null) {
      _dropoffAddressCtrl.text = dr.address ?? '${dr.latitude}, ${dr.longitude}';
    }
  }

  @override
  void didUpdateWidget(covariant PassengerHomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.passengerRealtime != widget.passengerRealtime) {
      _ensurePassengerRealtimeAttached();
    }
  }

  void _detachPassengerRealtime() {
    _orderStatusSub?.cancel();
    _driverLocSub?.cancel();
    _driverSnapSub?.cancel();
    _orderStatusSub = null;
    _driverLocSub = null;
    _driverSnapSub = null;
    widget.passengerRealtime?.unsubscribeFromOrder();
    _realtimeWiredOrderId = null;
  }

  void _ensurePassengerRealtimeAttached() {
    final rt = widget.passengerRealtime;
    final order = _activeOrder;
    if (rt == null || order == null) {
      _detachPassengerRealtime();
      if (order == null && mounted) {
        setState(() {
          _driverLat = null;
          _driverLng = null;
        });
      } else {
        _driverLat = null;
        _driverLng = null;
      }
      return;
    }

    if (_realtimeWiredOrderId == order.id &&
        _orderStatusSub != null) {
      return;
    }

    _detachPassengerRealtime();
    _realtimeWiredOrderId = order.id;
    rt.subscribeToOrder(order.id);

    _orderStatusSub = rt.orderStatusStream.listen((ev) {
      if (!mounted || ev.orderId != _activeOrder?.id) return;
      final o = _activeOrder;
      if (o == null) return;
      setState(() {
        _activeOrder = o.copyWith(
          status: ev.status,
          driverId: ev.driverId ?? o.driverId,
        );
      });
    });

    _driverLocSub = rt.driverLocationStream.listen((u) {
      if (!mounted || _activeOrder == null) return;
      setState(() {
        _driverLat = u.lat;
        _driverLng = u.lng;
      });
    });

    _driverSnapSub = rt.driverSnapshotStream.listen((snap) {
      if (!mounted || snap.orderId != _activeOrder?.id) return;
      final o = _activeOrder;
      if (o == null) return;
      setState(() {
        _activeOrder = o.copyWith(
          status: snap.status ?? o.status,
          driverId: snap.driverId ?? o.driverId,
        );
        if (snap.lat != null && snap.lng != null) {
          _driverLat = snap.lat;
          _driverLng = snap.lng;
        }
      });
    });
  }

  Future<void> _initialize() async {
    await _loadCurrentLocation();
    await _checkActiveOrder();
  }

  Future<void> _loadCurrentLocation() async {
    try {
      final location = await widget.locationService.getCurrentLocation();
      var addr =
          '${location.latitude.toStringAsFixed(5)}, ${location.longitude.toStringAsFixed(5)}';
      try {
        addr = await widget.orderRepository.reverseGeocode(
          lat: location.latitude,
          lng: location.longitude,
        );
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _currentLocation = location;
        _pickup ??= GeoPoint(
          latitude: location.latitude,
          longitude: location.longitude,
          address: addr,
        );
        _pickupAddressCtrl.text = _pickup!.address ?? addr;
      });
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.userFriendlyMessage);
    }
  }

  Future<void> _applyGeocodeField({required bool pickup}) async {
    final ctrl = pickup ? _pickupAddressCtrl : _dropoffAddressCtrl;
    final text = ctrl.text.trim();
    if (text.isEmpty) {
      setState(() => _error = 'Введите адрес и нажмите поиск или Enter');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final r = await widget.orderRepository.geocodeAddress(text);
      final pt =
          GeoPoint(latitude: r.latitude, longitude: r.longitude, address: r.normalizedAddress);
      if (!mounted) return;
      setState(() {
        if (pickup) {
          _pickup = pt;
          _pickupAddressCtrl.text = r.normalizedAddress;
          _selectingPoint = 'dropoff';
        } else {
          _dropoff = pt;
          _dropoffAddressCtrl.text = r.normalizedAddress;
        }
        _routeEstimate = null;
        _fareEstimate = null;
      });
      if (_pickup != null && _dropoff != null) {
        await _estimateRoute();
      }
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _useMyLocationAsPickup() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final loc = await widget.locationService.getCurrentLocation();
      var addr =
          '${loc.latitude.toStringAsFixed(5)}, ${loc.longitude.toStringAsFixed(5)}';
      try {
        addr = await widget.orderRepository.reverseGeocode(lat: loc.latitude, lng: loc.longitude);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _currentLocation = loc;
        _pickup = GeoPoint(latitude: loc.latitude, longitude: loc.longitude, address: addr);
        _pickupAddressCtrl.text = addr;
        _selectingPoint = 'dropoff';
        _routeEstimate = null;
        _fareEstimate = null;
      });
      if (_dropoff != null) {
        await _estimateRoute();
      }
    } on LocationException catch (e) {
      if (mounted) setState(() => _error = e.userFriendlyMessage);
    } catch (e) {
      if (mounted && e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _checkActiveOrder() async {
    try {
      final order = await widget.orderRepository.getActiveOrder();
      if (!mounted) return;
      setState(() => _activeOrder = order);
      _ensurePassengerRealtimeAttached();
    } catch (_) {}
  }

  Future<void> _onMapTap(double lat, double lng) async {
    setState(() => _isLoading = true);
    try {
      final address = await widget.orderRepository.reverseGeocode(lat: lat, lng: lng);
      final point = GeoPoint(latitude: lat, longitude: lng, address: address);
      if (!mounted) return;
      setState(() {
        if (_selectingPoint == 'pickup') {
          _pickup = point;
          _selectingPoint = 'dropoff';
        } else {
          _dropoff = point;
        }
        _routeEstimate = null;
        _fareEstimate = null;
      });
      _syncAddressFieldsFromGeoPoints();
      if (_pickup != null && _dropoff != null) {
        await _estimateRoute();
      }
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _estimateRoute() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() => _isLoading = true);
    try {
      final route = await widget.orderRepository.estimateRoute(
        fromLat: _pickup!.latitude,
        fromLng: _pickup!.longitude,
        toLat: _dropoff!.latitude,
        toLng: _dropoff!.longitude,
      );
      final fare = await widget.orderRepository.estimateFare(
        fromLat: _pickup!.latitude,
        fromLng: _pickup!.longitude,
        toLat: _dropoff!.latitude,
        toLng: _dropoff!.longitude,
      );
      if (!mounted) return;
      setState(() {
        _routeEstimate = route;
        _fareEstimate = fare;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _createOrder() async {
    if (_pickup == null || _dropoff == null) return;
    setState(() => _isLoading = true);
    try {
      final order = await widget.orderRepository.createOrder(
        fromLat: _pickup!.latitude,
        fromLng: _pickup!.longitude,
        toLat: _dropoff!.latitude,
        toLng: _dropoff!.longitude,
        pickupAddress: _pickup!.address,
        dropoffAddress: _dropoff!.address,
      );
      if (!mounted) return;
      setState(() {
        _activeOrder = order;
        _error = null;
      });
      _ensurePassengerRealtimeAttached();
    } catch (e) {
      if (!mounted) return;
      if (e is QueuedForSyncException) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.userFriendlyMessage)),
        );
      } else if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _cancelOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    try {
      await widget.orderRepository.cancelOrder(_activeOrder!.id);
      if (!mounted) return;
      setState(() {
        _activeOrder = null;
        _error = null;
      });
      _ensurePassengerRealtimeAttached();
    } catch (e) {
      if (!mounted) return;
      if (e is QueuedForSyncException) {
        setState(() {
          _activeOrder = null;
          _error = null;
        });
        _ensurePassengerRealtimeAttached();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.userFriendlyMessage)),
        );
      } else if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _openHistory() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrderHistoryScreen(orderRepository: widget.orderRepository),
      ),
    );
  }

  void _openProfile() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PassengerProfileScreen(authRepository: widget.authRepository),
      ),
    );
  }

  void _openTracking() {
    final id = _activeOrder?.id;
    if (id == null) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrderTrackingScreen(
          orderId: id,
          orderRepository: widget.orderRepository,
          dgisSession: widget.dgisSession,
          passengerRealtime: widget.passengerRealtime,
          initialSnapshot: _activeOrder,
        ),
      ),
    );
  }

  Future<void> _manualSync() async {
    final sync = widget.syncService;
    if (sync == null) return;
    try {
      await sync.runFullSync();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Синхронизация выполнена')),
      );
    } catch (_) {}
  }

  (double lat, double lng) _cameraCenterLatLng() {
    final active = _activeOrder;
    if (active?.pickupLat != null &&
        active?.pickupLng != null &&
        active?.dropoffLat != null &&
        active?.dropoffLng != null) {
      return (
        (active!.pickupLat! + active.dropoffLat!) / 2,
        (active.pickupLng! + active.dropoffLng!) / 2,
      );
    }
    if (_pickup != null && _dropoff != null) {
      return (
        (_pickup!.latitude + _dropoff!.latitude) / 2,
        (_pickup!.longitude + _dropoff!.longitude) / 2,
      );
    }
    if (_pickup != null) {
      return (_pickup!.latitude, _pickup!.longitude);
    }
    final loc = _currentLocation;
    if (loc != null) return (loc.latitude, loc.longitude);
    return (55.755826, 37.617298);
  }

  double _cameraZoom() {
    final active = _activeOrder;
    if (active?.pickupLat != null &&
        active?.pickupLng != null &&
        active?.dropoffLat != null &&
        active?.dropoffLng != null) {
      return 12.8;
    }
    if (_pickup != null && _dropoff != null) return 12.8;
    return 14.0;
  }

  Widget _buildMapPanel() {
    final center = _cameraCenterLatLng();
    final zoom = _cameraZoom();
    final pu = _pickup;
    final dr = _dropoff;
    final order = _activeOrder;

    final circles = <DgisCircleSpot>[
      if (order == null && pu != null)
        DgisCircleSpot(
          latitude: pu.latitude,
          longitude: pu.longitude,
          fillArgb: 0x881B5E20,
          radiusMeters: 52,
        ),
      if (order == null && dr != null)
        DgisCircleSpot(
          latitude: dr.latitude,
          longitude: dr.longitude,
          fillArgb: 0x88C62828,
          radiusMeters: 52,
        ),
      if (order != null &&
          order.pickupLat != null &&
          order.pickupLng != null)
        DgisCircleSpot(
          latitude: order.pickupLat!,
          longitude: order.pickupLng!,
          fillArgb: 0x881B5E20,
          radiusMeters: 56,
        ),
      if (order != null &&
          order.dropoffLat != null &&
          order.dropoffLng != null)
        DgisCircleSpot(
          latitude: order.dropoffLat!,
          longitude: order.dropoffLng!,
          fillArgb: 0x88C62828,
          radiusMeters: 56,
        ),
      if (order != null && _driverLat != null && _driverLng != null)
        DgisCircleSpot(
          latitude: _driverLat!,
          longitude: _driverLng!,
          fillArgb: 0xFF1976D2,
          radiusMeters: 48,
        ),
    ];

    List<MapLatLng> routePts = [];
    if (order == null && pu != null && dr != null) {
      final poly = _routeEstimate?.polyline;
      if (poly != null && poly.length >= 2) {
        routePts = poly;
      } else {
        routePts = [
          MapLatLng(pu.latitude, pu.longitude),
          MapLatLng(dr.latitude, dr.longitude),
        ];
      }
    } else if (order != null &&
        order.pickupLat != null &&
        order.pickupLng != null &&
        order.dropoffLat != null &&
        order.dropoffLng != null) {
      routePts = [
        MapLatLng(order.pickupLat!, order.pickupLng!),
        MapLatLng(order.dropoffLat!, order.dropoffLng!),
      ];
    }

    final primary = Theme.of(context).colorScheme.primary;
    final lineArgb =
        ((((primary.a * 255).round()) & 0xff) << 24) |
            ((((primary.r * 255).round()) & 0xff) << 16) |
            ((((primary.g * 255).round()) & 0xff) << 8) |
            (((primary.b * 255).round()) & 0xff);

    final session = widget.dgisSession;

    Widget mapCore;
    if (session == null) {
      final rasterSpots = circles
          .map(
            (c) => MapRasterSpot(
              latitude: c.latitude,
              longitude: c.longitude,
              fillColor: Color(c.fillArgb),
              radiusMeters: c.radiusMeters,
            ),
          )
          .toList();
      mapCore = RasterMapFallback(
        cameraLatitude: center.$1,
        cameraLongitude: center.$2,
        cameraZoom: zoom,
        spots: rasterSpots,
        routePoints: routePts,
        routeColor: primary,
        onMapTap: order != null ? null : (coord) => _onMapTap(coord.latitude, coord.longitude),
        myLocation: order == null && _currentLocation != null
            ? MapLatLng(_currentLocation!.latitude, _currentLocation!.longitude)
            : null,
      );
    } else {
      mapCore = DgisPlatformMap(
        session: session,
        scene: DgisMapScene(
          cameraLatitude: center.$1,
          cameraLongitude: center.$2,
          cameraZoom: zoom,
          circles: circles,
          routePoints: routePts,
          routeLineArgb: lineArgb,
          myLocationEnabled: true,
          onMapTap: order != null ? null : (coord) => _onMapTap(coord.latitude, coord.longitude),
        ),
      );
    }

    if (order != null) {
      return mapCore;
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned.fill(child: mapCore),
        Positioned(
          right: 10,
          bottom: 10,
          child: Material(
            elevation: 4,
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            color: Theme.of(context).colorScheme.surface,
            child: IconButton(
              tooltip: 'Моё местоположение (подача)',
              icon: Icon(Icons.my_location, color: Theme.of(context).colorScheme.primary),
              onPressed: _isLoading ? null : _useMyLocationAsPickup,
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Заказ такси'),
        actions: [
          IconButton(
            tooltip: 'История',
            icon: const Icon(Icons.history),
            onPressed: _openHistory,
          ),
          if (widget.syncService != null)
            IconButton(
              tooltip: 'Синхронизация',
              icon: const Icon(Icons.sync),
              onPressed: _manualSync,
            ),
          if (_activeOrder != null)
            IconButton(
              tooltip: 'Отслеживание',
              icon: const Icon(Icons.my_location),
              onPressed: _openTracking,
            ),
          IconButton(
            tooltip: 'Профиль',
            icon: const Icon(Icons.person),
            onPressed: _openProfile,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _buildMapPanel()),
          if (_error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              color: Colors.red[50],
              child: Text(_error!, style: TextStyle(color: Colors.red[800])),
            ),
          if (_activeOrder != null) _buildActiveOrderCard(),
          if (_activeOrder == null) _buildOrderForm(),
        ],
      ),
    );
  }

  Widget _buildAddressField({
    required String letter,
    required bool isPickup,
    required TextEditingController controller,
    required String hint,
  }) {
    final focused =
        _selectingPoint == (isPickup ? 'pickup' : 'dropoff');
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => setState(() => _selectingPoint = isPickup ? 'pickup' : 'dropoff'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          border:
              Border.all(color: focused ? Theme.of(context).colorScheme.primary : Colors.grey[300]!),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: isPickup ? Colors.green : Colors.red,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    letter,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: hint,
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                ),
                textInputAction: TextInputAction.search,
                onTap: () =>
                    setState(() => _selectingPoint = isPickup ? 'pickup' : 'dropoff'),
                onSubmitted: (_) {
                  if (!_isLoading) {
                    _applyGeocodeField(pickup: isPickup);
                  }
                },
              ),
            ),
            IconButton(
              tooltip: 'Найти адрес',
              icon: const Icon(Icons.search),
              onPressed: _isLoading ? null : () => _applyGeocodeField(pickup: isPickup),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderForm() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildAddressField(
            letter: 'А',
            isPickup: true,
            controller: _pickupAddressCtrl,
            hint: 'Откуда: введите адрес или нажмите на карте',
          ),
          const SizedBox(height: 10),
          _buildAddressField(
            letter: 'Б',
            isPickup: false,
            controller: _dropoffAddressCtrl,
            hint: 'Куда: введите адрес или нажмите на карте',
          ),
          if (_routeEstimate != null) ...[
            const SizedBox(height: 8),
            Text(
              '${_routeEstimate!.distanceKm.toStringAsFixed(1)} км · ${_routeEstimate!.estimatedDurationMin.toStringAsFixed(0)} мин',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
          if (_fareEstimate != null) ...[
            const SizedBox(height: 4),
            Text(
              '${_fareEstimate!.totalPrice.toStringAsFixed(0)} ₽',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _isLoading || _pickup == null || _dropoff == null ? null : _createOrder,
            child: _isLoading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Заказать'),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveOrderCard() {
    final order = _activeOrder!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: Text('Заказ #${shortOrderIdForUi(order.id)}', style: const TextStyle(fontWeight: FontWeight.bold))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor(order.status),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(_statusLabel(order.status), style: const TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ],
          ),
          if (order.driverName != null) ...[
            const SizedBox(height: 8),
            Text('Водитель: ${order.driverName}'),
            if (order.vehicleModel != null) Text('${order.vehicleModel} · ${order.vehiclePlate ?? ""}'),
          ],
          if (order.price != null) ...[
            const SizedBox(height: 4),
            Text('${order.price!.toStringAsFixed(0)} ₽', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
          const SizedBox(height: 12),
          if (order.status == 'NEW' || order.status == 'SEARCHING' || order.status == 'ASSIGNED')
            OutlinedButton(
              onPressed: _isLoading ? null : _cancelOrder,
              style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Отменить заказ'),
            ),
          FilledButton.icon(
            onPressed: _isLoading ? null : _openTracking,
            icon: const Icon(Icons.map, size: 18),
            label: const Text('Карта и трекинг'),
          ),
        ],
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'SEARCHING': return Colors.orange;
      case 'ASSIGNED': return Colors.blue;
      case 'IN_PROGRESS': return Colors.green;
      case 'DONE': return Colors.grey;
      case 'CANCELLED': return Colors.red;
      default: return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'NEW': return 'Новый';
      case 'SEARCHING': return 'Поиск водителя';
      case 'ASSIGNED': return 'Водитель назначен';
      case 'IN_PROGRESS': return 'В пути';
      case 'DONE': return 'Завершён';
      case 'CANCELLED': return 'Отменён';
      default: return status;
    }
  }
}
