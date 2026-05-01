import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_core/shared_core.dart';

import '../../earnings/presentation/earnings_screen.dart';
import '../../offer/presentation/offer_card_widget.dart';
import '../../profile/presentation/driver_profile_screen.dart';
import '../domain/shift_repository.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    super.key,
    required this.shiftRepository,
    required this.locationService,
    required this.authRepository,
    this.dgisSession,
    this.realtimeService,
    this.syncService,
  });

  final ShiftRepository shiftRepository;
  final LocationService locationService;
  final AuthRepository authRepository;
  final DgisSession? dgisSession;
  final DriverRealtimeService? realtimeService;
  final SyncService? syncService;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen> {
  ShiftInfo? _shift;
  DriverOrderCard? _activeOrder;
  LocationData? _driverLocation;
  bool _isLoading = false;
  String? _error;
  OrderOffer? _pendingOffer;

  Timer? _locationPump;
  StreamSubscription<OrderOfferEvent>? _offerSub;
  StreamSubscription<OfferClosedEvent>? _offerClosedSub;
  StreamSubscription<String>? _cancelledSub;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    _stopLocationPump();
    _offerSub?.cancel();
    _offerClosedSub?.cancel();
    _cancelledSub?.cancel();
    super.dispose();
  }

  Future<void> _initialize() async {
    await _loadDriverLocation();
    await _loadShiftStatus();
    await _checkActiveOrder();
    _attachRealtimeStreams();
    if (_shift?.isOnline ?? false) {
      _startLocationPump();
    }
  }

  void _attachRealtimeStreams() {
    final rt = widget.realtimeService;
    if (rt == null) return;

    _offerSub?.cancel();
    _offerClosedSub?.cancel();
    _cancelledSub?.cancel();

    _offerSub = rt.offerStream.listen((ev) {
      if (!mounted || ev.orderId.isEmpty) return;
      setState(() {
        _pendingOffer = OrderOffer(
          orderId: ev.orderId,
          price: ev.price,
          pickupAddress: ev.fromAddress,
          dropoffAddress: ev.toAddress,
          distanceKm: ev.distanceKm,
        );
      });
    });

    _offerClosedSub = rt.offerClosedStream.listen((ev) {
      if (!mounted || _pendingOffer?.orderId != ev.orderId) return;
      setState(() => _pendingOffer = null);
    });

    _cancelledSub = rt.orderCancelledStream.listen((id) {
      if (!mounted || _activeOrder?.id != id) return;
      unawaited(_checkActiveOrder());
    });
  }

  void _startLocationPump() {
    _stopLocationPump();
    final rt = widget.realtimeService;
    if (rt == null) return;
    _locationPump = Timer.periodic(const Duration(seconds: 8), (_) async {
      if (!mounted || !(_shift?.isOnline ?? false)) return;
      try {
        final loc = await widget.locationService.getCurrentLocation();
        if (!mounted || !(_shift?.isOnline ?? false)) return;
        setState(() => _driverLocation = loc);
        rt.sendLocationUpdate(loc);
      } catch (_) {}
    });
  }

  void _stopLocationPump() {
    _locationPump?.cancel();
    _locationPump = null;
  }

  Future<void> _loadDriverLocation() async {
    try {
      final l = await widget.locationService.getCurrentLocation();
      if (!mounted) return;
      setState(() => _driverLocation = l);
    } catch (_) {}
  }

  (double lat, double lng) _cameraCenterLatLng() {
    final order = _activeOrder;
    if (order?.pickupLat != null &&
        order?.pickupLng != null &&
        order?.dropoffLat != null &&
        order?.dropoffLng != null) {
      return (
        (order!.pickupLat! + order.dropoffLat!) / 2,
        (order.pickupLng! + order.dropoffLng!) / 2,
      );
    }
    if (order?.pickupLat != null && order?.pickupLng != null) {
      return (order!.pickupLat!, order.pickupLng!);
    }
    final loc = _driverLocation;
    if (loc != null) return (loc.latitude, loc.longitude);
    return (55.755826, 37.617298);
  }

  double _cameraZoom() {
    final order = _activeOrder;
    if (order?.pickupLat != null &&
        order?.pickupLng != null &&
        order?.dropoffLat != null &&
        order?.dropoffLng != null) {
      return 12.8;
    }
    return 14.0;
  }

  Widget _buildMapPanel() {
    final center = _cameraCenterLatLng();
    final zoom = _cameraZoom();
    final order = _activeOrder;
    final circles = <DgisCircleSpot>[
      if (order?.pickupLat != null && order?.pickupLng != null)
        DgisCircleSpot(
          latitude: order!.pickupLat!,
          longitude: order.pickupLng!,
          fillArgb: 0x881B5E20,
          radiusMeters: 56,
        ),
      if (order?.dropoffLat != null && order?.dropoffLng != null)
        DgisCircleSpot(
          latitude: order!.dropoffLat!,
          longitude: order.dropoffLng!,
          fillArgb: 0x88C62828,
          radiusMeters: 56,
        ),
    ];

    List<MapLatLng> routePts = [];
    if (order != null &&
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
      return RasterMapFallback(
        cameraLatitude: center.$1,
        cameraLongitude: center.$2,
        cameraZoom: zoom,
        spots: rasterSpots,
        routePoints: routePts,
        routeColor: primary,
      );
    }

    return DgisPlatformMap(
      session: session,
      scene: DgisMapScene(
        cameraLatitude: center.$1,
        cameraLongitude: center.$2,
        cameraZoom: zoom,
        circles: circles,
        routePoints: routePts,
        routeLineArgb: lineArgb,
        myLocationEnabled: true,
      ),
    );
  }

  Future<void> _loadShiftStatus() async {
    try {
      final shift = await widget.shiftRepository.getShiftStatus();
      if (!mounted) return;
      setState(() => _shift = shift);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    }
  }

  Future<void> _checkActiveOrder() async {
    try {
      final order = await widget.shiftRepository.getActiveOrder();
      if (!mounted) return;
      setState(() => _activeOrder = order);
    } catch (_) {}
  }

  Future<void> _toggleShift() async {
    setState(() => _isLoading = true);
    try {
      if (_shift?.isOnline ?? false) {
        await widget.shiftRepository.endShift();
        await widget.locationService.stopTracking();
        _stopLocationPump();
      } else {
        await widget.shiftRepository.startShift();
        await widget.locationService.startTracking();
        _startLocationPump();
      }
      await _loadShiftStatus();
      if (!mounted) return;
      setState(() => _error = null);
    } catch (e) {
      if (e is AppException && mounted) setState(() => _error = e.userFriendlyMessage);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _acceptOrder(String orderId) async {
    setState(() {
      _isLoading = true;
      _pendingOffer = null;
    });
    widget.realtimeService?.acceptOrder(orderId);
    try {
      await widget.shiftRepository.acceptOrder(orderId);
      await _checkActiveOrder();
      if (!mounted) return;
      setState(() => _error = null);
    } catch (e) {
      if (!mounted) return;
      if (e is QueuedForSyncException) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.userFriendlyMessage)));
      } else if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _declineOffer(String orderId) async {
    setState(() => _pendingOffer = null);
    widget.realtimeService?.declineOrder(orderId);
  }

  Future<void> _startOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    final id = _activeOrder!.id;
    try {
      await widget.shiftRepository.startOrder(id);
      await _checkActiveOrder();
    } catch (e) {
      if (!mounted) return;
      if (e is QueuedForSyncException) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.userFriendlyMessage)));
      } else if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _finishOrder() async {
    if (_activeOrder == null) return;
    setState(() => _isLoading = true);
    try {
      await widget.shiftRepository.finishOrder(_activeOrder!.id);
      setState(() => _activeOrder = null);
    } catch (e) {
      if (!mounted) return;
      if (e is QueuedForSyncException) {
        setState(() => _activeOrder = null);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.userFriendlyMessage)));
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
      await widget.shiftRepository.cancelOrder(_activeOrder!.id);
      setState(() => _activeOrder = null);
    } catch (e) {
      if (!mounted) return;
      if (e is QueuedForSyncException) {
        setState(() => _activeOrder = null);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.userFriendlyMessage)));
      } else if (e is AppException) {
        setState(() => _error = e.userFriendlyMessage);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _openEarnings() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => EarningsScreen(shiftRepository: widget.shiftRepository),
      ),
    );
  }

  void _openProfile() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => DriverProfileScreen(authRepository: widget.authRepository),
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

  @override
  Widget build(BuildContext context) {
    final isOnline = _shift?.isOnline ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Водитель'),
        actions: [
          if (widget.syncService != null)
            IconButton(
              tooltip: 'Синхронизация',
              icon: const Icon(Icons.sync),
              onPressed: _manualSync,
            ),
          IconButton(
            tooltip: 'Заработок',
            icon: const Icon(Icons.attach_money),
            onPressed: _openEarnings,
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
          if (_pendingOffer != null)
            OfferCardWidget(
              offer: _pendingOffer!,
              onAccept: _acceptOrder,
              onDecline: _declineOffer,
            ),
          Expanded(child: _buildMapPanel()),
          if (_error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              color: Colors.red[50],
              child: Text(_error!, style: TextStyle(color: Colors.red[800])),
            ),
          if (_activeOrder != null) _buildActiveOrderPanel(),
          _buildShiftPanel(isOnline),
        ],
      ),
    );
  }

  Widget _buildShiftPanel(bool isOnline) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              isOnline ? 'На линии' : 'Не на линии',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isOnline ? Colors.green : Colors.grey,
              ),
            ),
          ),
          Switch(
            value: isOnline,
            onChanged: _isLoading ? null : (_) => _toggleShift(),
            thumbIcon: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.selected)) {
                return const Icon(Icons.local_taxi, size: 16);
              }
              return null;
            }),
            trackColor: WidgetStateProperty.resolveWith((states) {
              return states.contains(WidgetState.selected) ? Colors.green.withValues(alpha: 0.5) : null;
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveOrderPanel() {
    final order = _activeOrder!;
    return Container(
      padding: const EdgeInsets.all(16),
      color: Colors.blue[50],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Заказ #${shortOrderIdForUi(order.id)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 4),
          if (order.pickupAddress != null) Text('Откуда: ${order.pickupAddress}'),
          if (order.dropoffAddress != null) Text('Куда: ${order.dropoffAddress}'),
          if (order.price != null) Text('${order.price!.toStringAsFixed(0)} ₽', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 8),
          Row(
            children: [
              if (order.status == 'ASSIGNED')
                Expanded(
                  child: FilledButton(
                    onPressed: _isLoading ? null : _startOrder,
                    child: const Text('Начать поездку'),
                  ),
                ),
              if (order.status == 'IN_PROGRESS')
                Expanded(
                  child: FilledButton(
                    onPressed: _isLoading ? null : _finishOrder,
                    child: const Text('Завершить'),
                  ),
                ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: _isLoading ? null : _cancelOrder,
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                child: const Text('Отмена'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
