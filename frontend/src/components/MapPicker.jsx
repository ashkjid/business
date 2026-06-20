import React, { useCallback, useRef, useState } from "react";
import { GoogleMap, useLoadScript, Marker, Autocomplete } from "@react-google-maps/api";
import { MapPin, Loader2, Search, X } from "lucide-react";

const containerStyle = { width: "100%", height: "100%" };
const defaultCenter = { lat: 28.6139, lng: 77.2090 }; // Delhi
const LIBS = ["places"];

export default function MapPicker({ apiKey, value, onChange }) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || "",
    libraries: LIBS,
  });
  const [marker, setMarker] = useState(value || null);
  const [searchText, setSearchText] = useState("");
  const mapRef = useRef(null);
  const autocompleteRef = useRef(null);

  const setLocation = useCallback(async (lat, lng, providedName) => {
    setMarker({ lat, lng });
    let location_name = providedName || "";
    if (!location_name) {
      try {
        if (window.google) {
          const geocoder = new window.google.maps.Geocoder();
          const res = await geocoder.geocode({ location: { lat, lng } });
          if (res.results?.[0]) location_name = res.results[0].formatted_address;
        }
      } catch {}
    }
    if (location_name) setSearchText(location_name);
    onChange?.({ lat, lng, location_name });
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(13);
    }
  }, [onChange]);

  const onMapClick = useCallback((e) => {
    setLocation(e.latLng.lat(), e.latLng.lng());
  }, [setLocation]);

  const onPlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place || !place.geometry?.location) return;
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    setLocation(lat, lng, place.formatted_address || place.name);
  };

  const clearLocation = () => {
    setMarker(null);
    setSearchText("");
    onChange?.(null);
  };

  if (loadError) return <div className="h-full flex items-center justify-center text-sm text-red-600 grid-bg" data-testid="map-error">Failed to load Google Maps. Verify API key.</div>;
  if (!isLoaded) return <div className="h-full flex items-center justify-center grid-bg" data-testid="map-loading"><Loader2 className="animate-spin text-neutral-400" /></div>;

  return (
    <div className="relative h-full w-full" data-testid="map-canvas">
      {/* Floating search box */}
      <div className="absolute top-4 left-4 right-4 z-10 max-w-md">
        <Autocomplete
          onLoad={(ac) => (autocompleteRef.current = ac)}
          onPlaceChanged={onPlaceChanged}
          options={{ fields: ["formatted_address", "geometry", "name"] }}
        >
          <div className="relative bg-white border border-neutral-300 shadow-lg">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <input
              data-testid="location-search-input"
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search a city, area or business — or click anywhere on the map"
              className="w-full pl-10 pr-10 h-11 text-sm bg-white outline-none focus:ring-1 focus:ring-[#FF4F00] font-mono placeholder:font-sans placeholder:text-neutral-500"
            />
            {searchText && (
              <button
                onClick={clearLocation}
                data-testid="location-clear-btn"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black"
                type="button"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </Autocomplete>
      </div>

      <GoogleMap
        mapContainerStyle={containerStyle}
        center={marker || defaultCenter}
        zoom={marker ? 13 : 5}
        onClick={onMapClick}
        onLoad={(m) => (mapRef.current = m)}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          styles: [{ featureType: "poi.business", stylers: [{ visibility: "off" }] }],
        }}
      >
        {marker && <Marker position={marker} />}
      </GoogleMap>

      {!marker && (
        <div className="absolute bottom-4 left-4 bg-black text-white px-3 py-2 text-xs font-medium tracking-wide flex items-center gap-2" data-testid="map-hint">
          <MapPin size={14} className="text-[#FF4F00]" /> Type a location above or click anywhere on the map
        </div>
      )}
    </div>
  );
}
