import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import PressableScale from '../src/components/PressableScale';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { radius, shadowCard, spacing, type } from '../src/theme';
import { timeAgo } from '../src/utils/format';
const {
  BIT_SINDRI_CAMPUS_REGION,
  CAMPUS_CATEGORIES,
  CAMPUS_LOCATIONS,
  CATEGORY_COLORS,
  searchCampusLocations,
  buildGoogleMapsDirectionsUrl,
} = require('../src/data/campusLocations');

// Dynamic safe-import for react-native-maps to prevent crashes on web/mock environments
let MapView = null;
let Marker = null;
let Callout = null;
let PROVIDER_GOOGLE = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Callout = Maps.Callout;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (e) {
  // Fallback for web or non-native platforms
}

const { width, height } = Dimensions.get('window');

/** Haversine formula for distance in meters */
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

function formatDistance(meters) {
  if (meters == null) return null;
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

function CampusMapScreen() {
  const c = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const location = useLocation();

  const mapRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  // Map state
  const [mapType, setMapType] = useState('standard'); // 'standard' | 'satellite'
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSos, setSelectedSos] = useState(null);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);

  // Responder SOS Overlay state
  const isSafetyStaff = user?.role === 'RESPONDER' || user?.role === 'ADMIN';
  const [showSosOverlay, setShowSosOverlay] = useState(isSafetyStaff);
  const [activeSosIncidents, setActiveSosIncidents] = useState([]);
  const [loadingSos, setLoadingSos] = useState(false);

  // Filtered locations
  const locations = useMemo(() => {
    return searchCampusLocations(searchQuery, activeCategory);
  }, [searchQuery, activeCategory]);

  // Load active SOS incidents for responders
  const fetchActiveSos = useCallback(async () => {
    if (!isSafetyStaff) return;
    setLoadingSos(true);
    try {
      const res = await api('/api/responder/incidents?status=NEW&isSos=true&limit=20');
      if (res && Array.isArray(res.items)) {
        setActiveSosIncidents(res.items);
      }
    } catch (e) {
      // Keep existing
    } finally {
      setLoadingSos(false);
    }
  }, [isSafetyStaff]);

  useEffect(() => {
    if (isSafetyStaff && showSosOverlay) {
      fetchActiveSos();
      const interval = setInterval(fetchActiveSos, 10000);
      return () => clearInterval(interval);
    }
  }, [isSafetyStaff, showSosOverlay, fetchActiveSos]);

  // Animate bottom card when selection changes
  useEffect(() => {
    if (selectedLocation || selectedSos) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedLocation, selectedSos, slideAnim]);

  // Reset to full campus view
  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.animateToRegion(BIT_SINDRI_CAMPUS_REGION, 600);
    }
    setSelectedLocation(null);
    setSelectedSos(null);
  };

  // Center on user location
  const handleMyLocation = async () => {
    const res = await location.request();
    if (res && res.coords && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: res.coords.latitude,
          longitude: res.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        700
      );
    }
  };

  // Zoom map in or out
  const handleZoom = (direction) => {
    if (mapRef.current) {
      const centerLat = selectedLocation?.latitude || BIT_SINDRI_CAMPUS_REGION.latitude;
      const centerLng = selectedLocation?.longitude || BIT_SINDRI_CAMPUS_REGION.longitude;
      const delta = direction > 0 ? 0.003 : 0.012;
      mapRef.current.animateToRegion(
        {
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: delta,
          longitudeDelta: delta,
        },
        300
      );
    }
  };

  // Immediate emergency spotlight on BIT Dispensary
  const handleSpotlightDispensary = () => {
    const disp = CAMPUS_LOCATIONS.find((l) => l.id === 'bit-dispensary');
    if (disp) {
      handleSelectLocation(disp);
    }
  };

  // Select location marker
  const handleSelectLocation = (loc) => {
    setSelectedSos(null);
    setSelectedLocation(loc);
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: 0.0035,
          longitudeDelta: 0.0035,
        },
        500
      );
    }
  };

  // Select SOS incident marker (Responders only)
  const handleSelectSos = (inc) => {
    setSelectedLocation(null);
    setSelectedSos(inc);
    if (inc.location?.latitude && inc.location?.longitude && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: inc.location.latitude,
          longitude: inc.location.longitude,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        },
        500
      );
    }
  };

  // Open Google Maps directions
  const handleOpenDirections = (lat, lng, name) => {
    const url = buildGoogleMapsDirectionsUrl(lat, lng, name);
    if (url) {
      Linking.openURL(url).catch((err) => console.warn('Could not launch directions:', err));
    }
  };

  const selectedDistance = useMemo(() => {
    if (!selectedLocation || !location.coords) return null;
    return distanceMeters(
      location.coords.latitude,
      location.coords.longitude,
      selectedLocation.latitude,
      selectedLocation.longitude
    );
  }, [selectedLocation, location.coords]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top']}>
      {/* 1. Header */}
      <ScreenHeader
        title="BIT Sindri Campus Map"
        subtitle="Dhanbad, Jharkhand · Verified Navigator"
        onBack={true}
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <PressableScale
              onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
              style={[styles.headerToolBtn, { backgroundColor: c.card, borderColor: c.border }]}
              accessibilityLabel="Toggle list or map view"
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>
                {viewMode === 'map' ? `📋 Directory` : '🗺️ Map'}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
              style={[styles.headerToolBtn, { backgroundColor: c.card, borderColor: c.border }]}
              accessibilityLabel="Toggle satellite or normal map"
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: c.primary }}>
                {mapType === 'standard' ? '🛰️' : '🗺️'}
              </Text>
            </PressableScale>
          </View>
        }
      />

      {/* 2. Search & Filter Bar */}
      <View style={[styles.filterContainer, { backgroundColor: c.background }]}>
        <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ fontSize: 15, marginRight: 6 }}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="Search buildings, hostels, library, gate..."
            placeholderTextColor={c.faint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <Text style={{ fontSize: 14, color: c.faint }}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Category horizontal scrolling bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CAMPUS_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setActiveCategory(cat.key)}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isActive ? c.primary : c.card,
                    borderColor: isActive ? c.primary : c.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, marginRight: 4 }}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: isActive ? c.onPrimary : c.text, fontWeight: isActive ? '700' : '500' },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Main Map / Facilities Directory View */}
      <View style={styles.mapWrapper}>
        {viewMode === 'list' ? (
          <ScrollView contentContainerStyle={styles.directoryScroll}>
            {locations.map((loc) => {
              const markerColor = CATEGORY_COLORS[loc.category] || c.primary;
              const dist = location.coords
                ? distanceMeters(location.coords.latitude, location.coords.longitude, loc.latitude, loc.longitude)
                : null;
              return (
                <PressableScale
                  key={loc.id}
                  onPress={() => {
                    handleSelectLocation(loc);
                    setViewMode('map');
                  }}
                  accessibilityLabel={`Facility: ${loc.name}`}
                >
                  <View style={[styles.facilityCard, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={styles.facilityTopRow}>
                      <View style={[styles.facilityIcon, { backgroundColor: markerColor }]}>
                        <Text style={{ fontSize: 18 }}>
                          {loc.category === 'SECURITY'
                            ? '👮'
                            : loc.category === 'MEDICAL'
                            ? '🏥'
                            : loc.category === 'HOSTEL'
                            ? '🏠'
                            : loc.category === 'FACILITY'
                            ? '☕'
                            : loc.category === 'SPORTS'
                            ? '⚽'
                            : '🏛️'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.tagRow}>
                          <View style={[styles.categoryBadge, { backgroundColor: markerColor }]}>
                            <Text style={styles.categoryBadgeText}>{loc.category}</Text>
                          </View>
                          <View style={styles.verifiedBadge}>
                            <Text style={styles.verifiedBadgeText}>✓ VERIFIED</Text>
                          </View>
                        </View>
                        <Text style={[styles.facilityTitle, { color: c.text }]}>{loc.name}</Text>
                        {loc.landmarkNearby ? (
                          <Text style={[styles.facilityLandmark, { color: c.faint }]}>📍 Near {loc.landmarkNearby}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={[styles.facilityDesc, { color: c.sub }]} numberOfLines={2}>{loc.description}</Text>
                    <View style={styles.facilityActions}>
                      <Text style={[styles.facilityDist, { color: c.primary }]}>
                        {dist != null ? `🚶 ${formatDistance(dist)} away` : `${loc.latitude.toFixed(4)}° N, ${loc.longitude.toFixed(4)}° E`}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <PressableScale
                          onPress={() => handleOpenDirections(loc.latitude, loc.longitude, loc.name)}
                          style={[styles.miniBtn, { backgroundColor: c.primarySoft, borderColor: c.primary }]}
                        >
                          <Text style={[styles.miniBtnText, { color: c.primaryDark }]}>Directions ↗️</Text>
                        </PressableScale>
                        <PressableScale
                          onPress={() => {
                            handleSelectLocation(loc);
                            setViewMode('map');
                          }}
                          style={[styles.miniBtn, { backgroundColor: c.cardElevated, borderColor: c.border }]}
                        >
                          <Text style={[styles.miniBtnText, { color: c.text }]}>View on Map 🗺️</Text>
                        </PressableScale>
                      </View>
                    </View>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        ) : MapView ? (
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            mapType={mapType}
            initialRegion={BIT_SINDRI_CAMPUS_REGION}
            showsUserLocation={location.status === 'granted'}
            showsMyLocationButton={false}
            showsCompass={true}
            toolbarEnabled={false}
            onMapReady={() => setIsMapReady(true)}
            onPress={() => {
              setSelectedLocation(null);
              setSelectedSos(null);
            }}
            style={StyleSheet.absoluteFillObject}
          >
            {/* Campus Verified Markers */}
            {locations.map((loc) => {
              const isSelected = selectedLocation?.id === loc.id;
              const markerColor = CATEGORY_COLORS[loc.category] || c.primary;
              return (
                <Marker
                  key={loc.id}
                  coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                  title={loc.name}
                  description={loc.description}
                  onPress={() => handleSelectLocation(loc)}
                >
                  <View
                    style={[
                      styles.customPin,
                      {
                        backgroundColor: markerColor,
                        borderColor: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.85)',
                        transform: [{ scale: isSelected ? 1.25 : 1 }],
                      },
                    ]}
                  >
                    <Text style={styles.customPinText}>
                      {loc.category === 'SECURITY'
                        ? '👮'
                        : loc.category === 'MEDICAL'
                        ? '🏥'
                        : loc.category === 'HOSTEL'
                        ? '🏠'
                        : loc.category === 'FACILITY'
                        ? '☕'
                        : loc.category === 'SPORTS'
                        ? '⚽'
                        : '🏛️'}
                    </Text>
                  </View>
                </Marker>
              );
            })}

            {/* Responder Live SOS Incidents Overlay */}
            {isSafetyStaff &&
              showSosOverlay &&
              activeSosIncidents.map((sos) => {
                const lat = sos.location?.latitude || (BIT_SINDRI_CAMPUS_REGION.latitude + 0.001);
                const lng = sos.location?.longitude || (BIT_SINDRI_CAMPUS_REGION.longitude - 0.001);
                const isSelected = selectedSos?.id === sos.id;
                return (
                  <Marker
                    key={`sos-${sos.id}`}
                    coordinate={{ latitude: lat, longitude: lng }}
                    onPress={() => handleSelectSos(sos)}
                  >
                    <View style={[styles.sosMarker, isSelected && styles.sosMarkerSelected]}>
                      <Text style={styles.sosMarkerIcon}>🚨</Text>
                      <View style={styles.sosPulse} />
                    </View>
                  </Marker>
                );
              })}
          </MapView>
        ) : (
          /* Web / Non-Native Fallback */
          <View style={[styles.fallbackContainer, { backgroundColor: c.card }]}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>🗺️</Text>
            <Text style={[styles.fallbackTitle, { color: c.text }]}>BIT Sindri Campus Navigator</Text>
            <Text style={[styles.fallbackSub, { color: c.sub }]}>
              Verified campus navigation with geo-referenced landmark points. Select a quick action below or browse the directory:
            </Text>
            <View style={{ flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
              <PressableScale
                onPress={() => setViewMode('list')}
                style={[styles.primaryActionBtn, { backgroundColor: c.primary, alignItems: 'center' }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>📋 Browse Facilities Directory ({CAMPUS_LOCATIONS.length} Places)</Text>
              </PressableScale>
              <PressableScale
                onPress={handleSpotlightDispensary}
                style={[styles.emergencyActionBtn, { backgroundColor: '#DC2626', alignItems: 'center' }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>🚑 Locate Campus Dispensary & First Aid</Text>
              </PressableScale>
              <PressableScale
                onPress={() => Linking.openURL('https://www.google.com/maps?q=23.6547,86.4737')}
                style={[styles.secondaryActionBtn, { backgroundColor: c.cardElevated, borderColor: c.border, alignItems: 'center' }]}
              >
                <Text style={{ color: c.text, fontWeight: '700' }}>Open in External Google Maps ↗️</Text>
              </PressableScale>
            </View>
          </View>
        )}

        {/* Floating Quick Action Controls on Map */}
        <View style={styles.floatingControls}>
          {/* Reset Full Campus View */}
          <PressableScale
            onPress={handleResetView}
            style={[styles.floatingBtn, { backgroundColor: c.card, borderColor: c.border }]}
            accessibilityLabel="Reset to full campus view"
          >
            <Text style={{ fontSize: 16 }}>🏫</Text>
          </PressableScale>

          {/* User Location */}
          <PressableScale
            onPress={handleMyLocation}
            style={[styles.floatingBtn, { backgroundColor: c.card, borderColor: c.border, marginTop: 8 }]}
            accessibilityLabel="Find my location"
          >
            <Text style={{ fontSize: 16 }}>📍</Text>
          </PressableScale>

          {/* Zoom In */}
          <PressableScale
            onPress={() => handleZoom(1)}
            style={[styles.floatingBtn, { backgroundColor: c.card, borderColor: c.border, marginTop: 8 }]}
            accessibilityLabel="Zoom in"
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>＋</Text>
          </PressableScale>

          {/* Zoom Out */}
          <PressableScale
            onPress={() => handleZoom(-1)}
            style={[styles.floatingBtn, { backgroundColor: c.card, borderColor: c.border, marginTop: 6 }]}
            accessibilityLabel="Zoom out"
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: c.text }}>−</Text>
          </PressableScale>

          {/* Responder Live SOS Toggle */}
          {isSafetyStaff && (
            <PressableScale
              onPress={() => setShowSosOverlay(!showSosOverlay)}
              style={[
                styles.floatingBtn,
                {
                  backgroundColor: showSosOverlay ? '#DC2626' : c.card,
                  borderColor: showSosOverlay ? '#991B1B' : c.border,
                  marginTop: 8,
                },
              ]}
              accessibilityLabel="Toggle live SOS incident overlay"
            >
              <Text style={{ fontSize: 16 }}>🚨</Text>
              {activeSosIncidents.length > 0 && (
                <View style={styles.sosBadgeCount}>
                  <Text style={styles.sosBadgeText}>{activeSosIncidents.length}</Text>
                </View>
              )}
            </PressableScale>
          )}
        </View>

        {/* Verified Location Count Ribbon & Emergency Quick Pill */}
        <View style={styles.ribbonRow}>
          <View style={[styles.ribbon, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.ribbonText, { color: c.sub }]}>
              📍 <Text style={{ fontWeight: '700', color: c.primary }}>{locations.length}</Text> facilities
            </Text>
          </View>
          <PressableScale
            onPress={handleSpotlightDispensary}
            style={[styles.dispensaryPill, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
            accessibilityLabel="Spotlight BIT Dispensary"
          >
            <Text style={styles.dispensaryPillText}>🚑 Health Clinic</Text>
          </PressableScale>
        </View>

        {/* 4. Sliding Bottom Details Card (Location Selected) */}
        {selectedLocation && (
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.tagRow}>
                  <View
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: CATEGORY_COLORS[selectedLocation.category] || c.primary },
                    ]}
                  >
                    <Text style={styles.categoryBadgeText}>{selectedLocation.category}</Text>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedBadgeText}>✓ VERIFIED</Text>
                  </View>
                </View>
                <Text style={[styles.sheetTitle, { color: c.text }]}>{selectedLocation.name}</Text>
                {selectedLocation.landmarkNearby && (
                  <Text style={[styles.sheetLandmark, { color: c.faint }]}>
                    Near: {selectedLocation.landmarkNearby}
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => setSelectedLocation(null)}
                style={styles.sheetCloseBtn}
                hitSlop={12}
              >
                <Text style={{ fontSize: 16, color: c.faint }}>✕</Text>
              </Pressable>
            </View>

            <Text style={[styles.sheetDesc, { color: c.sub }]}>{selectedLocation.description}</Text>

            <View style={styles.metaFooter}>
              <View style={styles.distMeta}>
                <Text style={[styles.distText, { color: c.primary }]}>
                  {selectedDistance != null ? `🚶 ${formatDistance(selectedDistance)} away` : '📍 WGS-84 Coordinates'}
                </Text>
                <Text style={[styles.coordSub, { color: c.faint }]}>
                  {selectedLocation.latitude.toFixed(4)}° N, {selectedLocation.longitude.toFixed(4)}° E
                </Text>
              </View>

              <PressableScale
                onPress={() =>
                  handleOpenDirections(
                    selectedLocation.latitude,
                    selectedLocation.longitude,
                    selectedLocation.name
                  )
                }
                style={[styles.directionsBtn, { backgroundColor: c.primary }]}
              >
                <Text style={styles.directionsBtnText}>Directions ↗️</Text>
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* 5. Sliding Bottom Card (Authorized Responder SOS Selected) */}
        {selectedSos && (
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: '#FFF1F2',
                borderColor: '#F43F5E',
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: '#F43F5E' }]} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <View style={[styles.categoryBadge, { backgroundColor: '#DC2626' }]}>
                  <Text style={styles.categoryBadgeText}>🚨 CRITICAL SOS DISPATCH</Text>
                </View>
                <Text style={[styles.sheetTitle, { color: '#881337', marginTop: 4 }]}>
                  {selectedSos.title || 'Emergency SOS Alert'}
                </Text>
                <Text style={{ fontSize: 12, color: '#9F1239' }}>
                  Reported by {selectedSos.reporter?.name || 'Student'} · {timeAgo(selectedSos.createdAt)}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedSos(null)} style={styles.sheetCloseBtn}>
                <Text style={{ fontSize: 16, color: '#9F1239' }}>✕</Text>
              </Pressable>
            </View>

            <Text style={{ fontSize: 13, color: '#881337', marginVertical: 6 }}>
              Location: {selectedSos.location?.campusLandmark || 'Campus Ground'} (
              {selectedSos.location?.buildingOrRoom || 'Coordinates locked'})
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {selectedSos.location?.latitude && (
                <PressableScale
                  onPress={() =>
                    handleOpenDirections(
                      selectedSos.location.latitude,
                      selectedSos.location.longitude,
                      'SOS Emergency Incident'
                    )
                  }
                  style={[styles.directionsBtn, { backgroundColor: '#9F1239', flex: 1 }]}
                >
                  <Text style={styles.directionsBtnText}>Navigate to SOS ↗️</Text>
                </PressableScale>
              )}
              <PressableScale
                onPress={() => router.push('/dashboard')}
                style={[styles.directionsBtn, { backgroundColor: '#DC2626', flex: 1 }]}
              >
                <Text style={styles.directionsBtnText}>Open Console →</Text>
              </PressableScale>
            </View>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

export default function CampusMap() {
  return (
    <AuthGate>
      <CampusMapScreen />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerToolBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterContainer: {
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.s,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    height: 42,
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: spacing.s,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  customPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  customPinText: {
    fontSize: 15,
  },
  sosMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  sosMarkerSelected: {
    transform: [{ scale: 1.3 }],
    borderColor: '#FEE2E2',
  },
  sosMarkerIcon: {
    fontSize: 18,
  },
  sosPulse: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.5)',
  },
  floatingControls: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 10,
  },
  floatingBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...shadowCard,
  },
  sosBadgeCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#991B1B',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  ribbonRow: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    zIndex: 10,
  },
  ribbon: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    ...shadowCard,
  },
  ribbonText: {
    fontSize: 11.5,
  },
  dispensaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    ...shadowCard,
  },
  dispensaryPillText: {
    color: '#B91C1C',
    fontSize: 11.5,
    fontWeight: '800',
  },
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  fallbackSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  primaryActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.m,
  },
  emergencyActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.m,
  },
  secondaryActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.m,
    borderWidth: 1,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    right: 14,
    borderRadius: radius.l,
    padding: spacing.m,
    borderWidth: 1,
    ...shadowCard,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.s,
  },
  categoryBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.s,
    backgroundColor: '#DCFCE7',
  },
  verifiedBadgeText: {
    color: '#15803D',
    fontSize: 9.5,
    fontWeight: '800',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetLandmark: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetCloseBtn: {
    padding: 6,
  },
  sheetDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  metaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  distMeta: {
    flex: 1,
  },
  distText: {
    fontSize: 13,
    fontWeight: '700',
  },
  coordSub: {
    fontSize: 11,
    marginTop: 2,
  },
  directionsBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.m,
    alignItems: 'center',
  },
  directionsBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  directoryScroll: {
    padding: spacing.m,
    paddingBottom: spacing.xxl,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  facilityCard: {
    borderRadius: radius.l,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
    ...shadowCard,
  },
  facilityTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.m,
  },
  facilityIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    marginTop: 2,
  },
  facilityLandmark: {
    fontSize: 11.5,
    marginTop: 2,
  },
  facilityDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 8,
  },
  facilityActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  facilityDist: {
    fontSize: 12,
    fontWeight: '700',
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.s,
    borderWidth: 1,
  },
  miniBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
});
