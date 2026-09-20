// setup

// measure panel size
function panel_size(selector) {
    const el = document.querySelector(selector);
    const rect = el.getBoundingClientRect();
    return {
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
    };
}

// cons
const world_atlas_countries = "https://unpkg.com/world-atlas@2/countries-110m.json"; // every shape (countries, continents, Greenland) comes from this one source now

// ISO 3166-1 numeric ids grouped by continent, zero-padded to match world-atlas's feature.id.
// These don't need to be exhaustive — the 110m dataset already drops most small island nations,
// and any id here that isn't present is just silently skipped when filtering.
const continent_ids = {
    "Africa": new Set([
        "012", "024", "204", "072", "854", "108", "132", "120", "140", "148",
        "174", "178", "180", "262", "818", "226", "232", "748", "231", "266",
        "270", "288", "324", "624", "384", "404", "426", "430", "434", "450",
        "454", "466", "478", "480", "504", "508", "516", "562", "566", "646",
        "678", "686", "690", "694", "706", "710", "728", "729", "834", "768",
        "788", "800", "732", "894", "716"
    ]),
    "Asia": new Set([
        "004", "051", "031", "048", "050", "064", "096", "116", "156", "268",
        "356", "360", "364", "368", "376", "392", "400", "398", "414", "417",
        "418", "422", "458", "462", "496", "104", "524", "408", "512", "586",
        "275", "608", "634", "682", "702", "410", "144", "760", "762", "764",
        "626", "792", "795", "784", "860", "704", "887", "643"
    ]),
    "Europe": new Set([
        "008", "020", "040", "112", "056", "070", "100", "191", "196", "203",
        "208", "233", "246", "250", "276", "300", "348", "352", "372", "380",
        "428", "438", "440", "442", "807", "470", "498", "492", "499", "528",
        "578", "616", "620", "642", "674", "688", "703", "705", "724", "752",
        "756", "804", "826", "336"
    ]),
    "North America": new Set([
        "124", "840", "484", "084", "188", "222", "320", "340", "558", "591",
        "044", "192", "214", "332", "388", "780"
    ]),
    "South America": new Set([
        "032", "068", "076", "152", "170", "218", "328", "600", "604", "740",
        "858", "862"
    ]),
    // Fiji ("242") is deliberately excluded — it straddles the antimeridian, and unioning a
    // shape that crosses ±180° with planar tools like turf.union produces a corrupted result
    // (that's the stray sweeping-arc artifact across the Oceania shape).
    "Oceania": new Set([
        "036", "554", "598", "090", "548"
    ]),
    "Antarctica": new Set(["010"])
};

const panel = panel_size("#page");
const w = panel.width;
const h = panel.height;

const pixels_degree = 0.4; // dragging sensibility

// every shape currently on the board — built up as shapes get added, starting empty
const shapes_setup = [];

// each shape's true, undragged centroid (set once its geometry is ready) — see shape_state below
const shape_origin = {};

// per-shape live state: where each shape's centroid currently sits on the globe (absolute lat/lon,
// not a relative offset) — so dragging two shapes to the same lat/lon actually lands them in the
// same place, rather than shifting each by the same amount from wherever it started.
const shape_state = {};

// a world-spanning extent (stopping at ±85°, the standard "web mercator" convention, rather
// than the true poles) used to fit the four whole-world projections. This keeps degrees-to-
// pixels roughly consistent with the coordinate tags' -180..180 / -90..90 scale, so dragging
// a shape a given number of degrees produces a proportional shift on screen.
const world_extent = {
    type: "Polygon",
    coordinates: [[
        [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]
    ]]
};

// Albers is a conic projection tuned for one specific mid-latitude band (its `parallels`
// below) — it fits to that band directly now, rather than to any particular loaded shape,
// so it no longer depends on Brazil (or anything else) being present.
const albers_fit_extent = {
    type: "Polygon",
    coordinates: [[
        [-180, -35], [180, -35], [180, -5], [-180, -5], [-180, -35]
    ]]
};

// Dymaxion (Airocean) unfolds the globe onto an icosahedron rather than a lat/lon rectangle,
// so fitting it to the same ±85° world_extent as the four rectangular projections below would
// just fit the net to an arbitrary lat/lon box instead of its own natural outline. It fits to
// the whole sphere instead.
const dymaxion_fit_extent = { type: "Sphere" };

// loading projections, in chronological order: Mercator (1569), Albers (1805),
// Gall-Peters (1855), Dymaxion (1943), Robinson (1963), and Equal Earth (2018, the
// projection the UN endorsed over Mercator in 2026, key "un" below). Mercator, Gall-Peters,
// Robinson and Equal Earth are the four whole-world rectangular projections, so they share
// `world_extent`; Albers and Dymaxion each fit to their own extent instead (see the comments
// above).
const projections_setup = [
    {
        key: "mercator",
        selector: "#vis-mercator",
        create: () => d3.geoMercator(),
        width: w,
        scale_factor: 1.0,
        fit: world_extent
    },
    {
        key: "albers",
        selector: "#vis-albers",
        create: () => d3.geoConicEqualArea().parallels([-5, -35]), // matches albers_fit_extent above
        width: w,
        scale_factor: 1.0,
        fit: albers_fit_extent,
        translate: [w / 2, h / 10]
    },
    {
        key: "peters",
        selector: "#vis-peters",
        create: () => d3.geoCylindricalEqualArea().parallel(45), // standard 45 parallels
        width: w,
        scale_factor: 1.0,
        fit: world_extent
    },
    {
        key: "dymaxion",
        selector: "#vis-dymaxion",
        // Fuller's Airocean/Dymaxion projection, from d3-geo-polygon (already loaded in
        // index.html). Polyhedral, not rectangular — see dymaxion_fit_extent above.
        create: () => d3.geoAirocean(),
        width: w,
        scale_factor: 1.0,
        fit: dymaxion_fit_extent
    },
    {
        key: "robinson",
        selector: "#vis-robinson",
        create: () => d3.geoRobinson(),
        width: w,
        scale_factor: 1.0,
        fit: world_extent
    },
    {
        key: "un",
        selector: "#vis-un",
        // Equal Earth (Šavrič/Patterson/Jenny, 2018) — the equal-area projection the UN
        // General Assembly's Sept. 2026 resolution promotes in place of Mercator. Distinct
        // from Gall-Peters: same accurate area ratios, less shape distortion.
        create: () => d3.geoEqualEarth(),
        width: w,
        scale_factor: 1.0,
        fit: world_extent
    }
];

// panel frames (svg + projection + path generator), keyed by projection
const panel_frames = {};

// rendered path elements, keyed [shape_key][panel_key] = { interactive, hit }
const shape_paths = {};

const hit_stroke_width = 16; // fat invisible target so a 2px line is actually easy to grab

// the loaded geometry for each shape, keyed by shape key
const shape_geo = {};

// every country from world-atlas, populated once — shared by the country search, the
// continent dropdown, and the two default shapes (Greenland, Africa)
let world_countries = [];

// tracks whichever dropdown (country/continent/shape) is currently open, if any — see
// open_dropdown_portal below. Declared up here with the rest of the shared state rather than
// down next to the dropdown code itself, so it's always initialized before anything could
// possibly call into that code.
let close_current_dropdown = null;

// how far the dropdown portal's box extends outward (border + padding) from the row it's
// anchored to — kept with the other shared constants for the same reason as above.
const PORTAL_BORDER_AND_PAD_X = 9; // 1px border + 8px padding
const PORTAL_BORDER_AND_PAD_TOP = 0; // the row above sits only 1px away, leaving no room to also pad above the header text

// breathing room between a plain row (no header duplicated inside the box, like country's
// input) and the box's top border — separate from PORTAL_BORDER_AND_PAD_TOP above, which
// instead pulls the box UP to wrap around a header line. Without its own gap here, the box's
// top border sat flush against — visually touching — the row right above it.
const DROPDOWN_GAP_BELOW_ROW = 4;


// --- spherical geometry helpers -----------------------------------------
// dragging works by rotating the whole sphere so a shape's centroid lands exactly on the
// target lat/lon — a true rotation, unlike naively adding degrees to each coordinate, so it
// has no seam/discontinuity at the antimeridian or the poles.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function lonlat_to_vec(lon, lat) {
    const λ = lon * DEG2RAD, φ = lat * DEG2RAD;
    const cosφ = Math.cos(φ);
    return [cosφ * Math.cos(λ), cosφ * Math.sin(λ), Math.sin(φ)];
}

function vec_to_lonlat([x, y, z]) {
    return [Math.atan2(y, x) * RAD2DEG, Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG];
}

function rot_z(theta_rad) {
    const c = Math.cos(theta_rad), s = Math.sin(theta_rad);
    return ([x, y, z]) => [c * x - s * y, s * x + c * y, z];
}

function rot_y(theta_rad) {
    const c = Math.cos(theta_rad), s = Math.sin(theta_rad);
    return ([x, y, z]) => [c * x - s * z, y, s * x + c * z];
}

// a function that rotates the sphere so point (fromLon,fromLat) lands exactly on (toLon,toLat):
// un-rotate to bring "from" to the lon=0 meridian, tilt latitude to match, rotate back out to "to"
function build_mover(fromLon, fromLat, toLon, toLat) {
    const step1 = rot_z(-fromLon * DEG2RAD);
    const step2 = rot_y((toLat - fromLat) * DEG2RAD);
    const step3 = rot_z(toLon * DEG2RAD);
    return (vec) => step3(step2(step1(vec)));
}

// apply a rotation function to every [lon, lat] pair in a coordinates array, any nesting depth
function rotate_coords(coords, move) {
    if (typeof coords[0][0] === "number") {
        return coords.map(([lon, lat]) => vec_to_lonlat(move(lonlat_to_vec(lon, lat))));
    } else {
        return coords.map((c) => rotate_coords(c, move));
    }
}

function rotate_feature(feature, move) {
    return {
        type: feature.type,
        properties: feature.properties,
        geometry: {
            type: feature.geometry.type,
            coordinates: rotate_coords(feature.geometry.coordinates, move)
        }
    };
}

// wrap a longitude into (-180, 180] — only used for the on-screen readout; the rotation math
// above is periodic and never needs this to render correctly.
function wrap_lon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
}


// --- geometry helpers ----------------------------------------------------

// a merged/unioned polygon can end up with its ring wound the wrong way. When that happens,
// every function that relies on "which side is inside" (d3.geoArea, d3.geoCentroid, the path
// renderer) reads it backwards. We check with d3.geoArea specifically — not a flat Shoelace
// calculation like some libraries use, which can misjudge large or pole-adjacent shapes —
// because it's the exact same measurement d3.geoCentroid and d3.geoPath use internally, so
// checking with it guarantees the fix matches what actually gets rendered. A real feature can
// never cover more than half the globe, so an area over 2π steradians means it's backwards.
function ensure_winding(feature) {
    if (!feature) return feature;
    try {
        const area = d3.geoArea(feature);
        if (area > 2 * Math.PI) {
            return reverse_rings(feature);
        }
    } catch (e) {
        console.warn("ensure_winding: could not measure a shape's area", e);
    }
    return feature;
}

function reverse_rings(feature) {
    return {
        type: feature.type,
        properties: feature.properties,
        geometry: {
            type: feature.geometry.type,
            coordinates: reverse_ring_coords(feature.geometry.coordinates)
        }
    };
}

// Polygon coordinates = [ring, ring, ...], ring = [[lon,lat], ...] (3 levels deep).
// MultiPolygon coordinates = [polygon, polygon, ...] (4 levels deep) — recurse one level.
function reverse_ring_coords(coords) {
    if (typeof coords[0][0][0] === "number") {
        return coords.map((ring) => ring.slice().reverse());
    } else {
        return coords.map((poly) => reverse_ring_coords(poly));
    }
}

// dissolve a list of GeoJSON features (that share borders) into one shape.
// tries turf's batch union first (turf 7), falls back to pairwise union (turf 6-style API)
//
// A feature that straddles the antimeridian (Russia, Fiji) gets unwrapped first — see
// straddles_antimeridian/unwrap_antimeridian below. Skipping that step is what caused the
// stray sweeping-arc artifact across Asia (Russia's far-east sliver corrupting the merge the
// same way Fiji's exclusion note further up already documented for Oceania) — but unlike
// Fiji, Russia is too much of Asia to just leave out, so this fixes the merge instead.
function union_all(features) {
    const valid = features
        .filter((f) => f && f.geometry)
        .map((f) => (straddles_antimeridian(f) ? unwrap_antimeridian(f) : f));
    if (valid.length === 0) return null;
    if (valid.length === 1) return ensure_winding(valid[0]);

    try {
        const fc = turf.featureCollection(valid);
        const merged = turf.union(fc);
        if (merged) return ensure_winding(merged);
    } catch (e) {
        // fall through to pairwise union below
    }

    let acc = valid[0];
    for (let i = 1; i < valid.length; i++) {
        try {
            const merged = turf.union(acc, valid[i]);
            if (merged) acc = merged;
        } catch (e) {
            console.warn("union_all: skipped a feature that failed to merge", e);
        }
    }
    return ensure_winding(acc);
}

// true only when a SINGLE feature's own geometry has points near both +180 and -180 — i.e.
// it individually straddles the antimeridian (Russia, Fiji). This must be a per-feature
// check, not a blanket "any longitude below X" rule: North America legitimately spans deep
// into negative longitudes (Alaska, Canada) with no antimeridian involved at all, and a
// blanket rule would wrongly mangle it.
function straddles_antimeridian(feature) {
    let has_near_positive = false;
    let has_near_negative = false;
    (function scan(coords) {
        if (typeof coords[0][0] === "number") {
            coords.forEach(([lon]) => {
                if (lon > 170) has_near_positive = true;
                if (lon < -170) has_near_negative = true;
            });
        } else {
            coords.forEach(scan);
        }
    })(feature.geometry.coordinates);
    return has_near_positive && has_near_negative;
}

// shifts a straddling feature's negative-longitude points by +360 so the whole feature
// occupies one continuous numeric range instead of wrapping through ±180. Planar tools like
// turf.union don't know about spherical wraparound — a piece near +179° and another near
// -179° look 358 units apart to them, not the real ~2°, and unioning across that gap is what
// produces the corrupted, spuriously-connected result. d3's projections are trig-based and
// periodic, so downstream rendering and rotation are unaffected by longitudes past 180°.
function unwrap_antimeridian(feature) {
    function remap(coords) {
        if (typeof coords[0][0] === "number") {
            return coords.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
        }
        return coords.map(remap);
    }
    return {
        type: feature.type,
        properties: feature.properties,
        geometry: { type: feature.geometry.type, coordinates: remap(feature.geometry.coordinates) }
    };
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}


// --- synthetic geometric shapes -------------------------------------------
// generated fresh at (lon 0, lat 0) each time one is added, then dragged like any other shape

function make_square() {
    const d = 12; // half-width in degrees
    return turf.polygon([[[-d, -d], [d, -d], [d, d], [-d, d], [-d, -d]]], { name: "Square" });
}

function make_triangle() {
    return turf.polygon([[[0, 15], [-13, -9], [13, -9], [0, 15]]], { name: "Triangle" });
}

function make_circle() {
    // a true small circle on the sphere's surface, ~1500km radius
    return turf.circle([0, 0], 1500, { steps: 64, units: "kilometers", properties: { name: "Circle" } });
}

const geometric_shapes = {
    "Square": make_square,
    "Triangle": make_triangle,
    "Circle": make_circle
};


// --- loading + startup ----------------------------------------------------

const load_world_atlas = d3.json(world_atlas_countries)
    .then((topology) => ({
        countries: topojson.feature(topology, topology.objects.countries).features,
        land: topojson.feature(topology, topology.objects.land) // pre-merged, all-continents landmass
    }))
    .catch((err) => {
        console.error(`World atlas data failed to load from "${world_atlas_countries}". Every shape in this version depends on it (countries, continents, and Greenland). This requires a live internet connection and the topojson-client + turf scripts loaded in index.html.`, err);
        return { countries: [], land: null };
    });

build_panels(); // panel frames don't depend on any shape data anymore, so this can happen immediately
setup_projection_controls();
setup_global_controls();
setup_shape_dragging();
setup_footer_toggle();

load_world_atlas.then(({ countries, land }) => {
    world_countries = countries;

    if (countries.length === 0) return; // already logged above

    if (land) draw_land_layer(land);

    setup_country_search();
    setup_continent_picker();
    setup_geometric_shape_picker();

    // default shapes: Greenland (a single country in this dataset) + Africa (a continent)
    const greenland = countries.find((f) => String(f.id) === "304");
    if (greenland) {
        add_shape("greenland", "Greenland", ensure_winding(greenland));
    } else {
        console.warn("Greenland (id 304) wasn't found in the world atlas data.");
    }

    const africa_countries = countries.filter((f) => continent_ids["Africa"].has(String(f.id)));
    const africa = union_all(africa_countries);
    if (africa) {
        add_shape("africa", "Africa", africa);
    } else {
        console.warn("Couldn't build Africa from the world atlas data.");
    }
});


// build the projection panels (frames only — shapes are added separately via add_shape_paths).
// every panel now fits a fixed target (the whole world, or Albers' mid-latitude band) instead
// of any particular loaded shape, so this has no dependency on shape data at all.
function build_panels() {
    projections_setup.forEach((cfg) => {
        const svg = d3
            .select(cfg.selector)
            .append("svg")
            .attr("width", cfg.width)
            .attr("height", h);

        const projection = cfg.create();

        projection.fitSize([cfg.width, h], cfg.fit);
        const base_scale = projection.scale();
        projection.scale(base_scale * cfg.scale_factor);
        if (cfg.translate) projection.translate(cfg.translate);
        projection
            // Mercator (and any true conformal cylindrical projection) genuinely goes to
            // infinity at the poles — clipping to the visible area lets a shape dragged near
            // a pole correctly run off the edge instead of drawing huge runaway coordinates.
            .clipExtent([[0, 0], [cfg.width, h]]);

        const path_create = d3.geoPath(projection);

        panel_frames[cfg.key] = { cfg, svg, projection, path_create };

        // the projection's own boundary ("limits") and a 10° reference grid ("grid") —
        // drawn first so shapes/land always layer on top, both toggleable from the controls above
        const globe_outline = svg
            .append("path")
            .datum({ type: "Sphere" })
            .attr("class", "globe-outline")
            .attr("fill", "none")
            .attr("d", path_create);

        const globe_grid = svg
            .append("path")
            .datum(d3.geoGraticule10())
            .attr("class", "globe-grid")
            .attr("fill", "none")
            .attr("d", path_create);
    });
}


// draw the real, undragged landmass of every continent at once — a static backdrop, not a
// draggable shape, toggled with the "Land" control
function draw_land_layer(land_feature) {
    const land_toggle = document.getElementById("toggle-land");
    const visible = !land_toggle || land_toggle.checked; // respect whatever the checkbox already says

    Object.values(panel_frames).forEach((frame) => {
        frame.svg
            .append("path")
            .datum(land_feature)
            .attr("class", "globe-land")
            .attr("fill", "none")
            .style("display", visible ? null : "none")
            .attr("d", frame.path_create);
    });
}


// draw one shape's path (visible + invisible hit target) into every panel
function add_shape_paths(key) {
    const geo = shape_geo[key];
    shape_paths[key] = {};

    Object.values(panel_frames).forEach((frame) => {
        const interactive = frame.svg
            .append("path")
            .datum(geo)
            .attr("class", `shape-interactive shape-${key}`)
            .attr("fill", "none")
            .attr("stroke-width", 2)
            .attr("stroke-linejoin", "round")
            .attr("d", frame.path_create);

        // invisible fat stroke on top, purely for grabbing — the visible line above is too thin to click reliably
        const hit = frame.svg
            .append("path")
            .datum(geo)
            .attr("class", `shape-hit shape-${key}`)
            .attr("data-shape-key", key)
            .attr("fill", "none")
            .attr("stroke", "transparent")
            .attr("stroke-width", hit_stroke_width)
            .attr("d", frame.path_create);

        shape_paths[key][frame.cfg.key] = { interactive, hit };
    });
}


// re-render one shape (across all panels) at its current absolute lat/lon, via a true
// spherical rotation from its original position — see build_mover above
function render_shape(key) {
    const origin = shape_origin[key];
    const state = shape_state[key];
    const move = build_mover(origin.lon, origin.lat, state.lon, state.lat);
    const shifted = rotate_feature(shape_geo[key], move);

    Object.values(panel_frames).forEach((frame) => {
        const paths = shape_paths[key][frame.cfg.key];
        paths.interactive.datum(shifted).attr("d", frame.path_create);
        paths.hit.datum(shifted).attr("d", frame.path_create);
    });
}


// drag a single shape — moves that shape (and only that shape) across all panels at once, by
// setting its absolute lat/lon.
//
// The five panels are drawn deliberately large and overlapping (that's the whole point of the
// cascade/multiply-blend look), so at almost any pixel there can be several different panels'
// invisible hit-strokes stacked on top of each other. A plain per-element listener (the
// browser's normal hit-testing) only ever notifies whichever one is topmost in the DOM — in
// this markup that's always the last panel (Robinson) — so every drag anywhere near one of its
// shapes would grab Robinson's copy even when you're clearly pointing at, say, Winkel's line.
//
// Instead there's one shared pointerdown listener on the whole maps area (setup_shape_dragging,
// called once). It asks the browser for every hit-target stacked at that pixel — not just the
// topmost — and starts dragging whichever one's actual line is physically closest to the
// cursor. That makes every panel's copy of every shape independently grabbable.
function closest_point_on_path(path, x, y) {
    const total = path.getTotalLength();
    if (total === 0) return Infinity;
    const steps = 60; // coarse sampling is plenty for a 16px-wide hit target
    let best = Infinity;
    for (let i = 0; i <= steps; i++) {
        const p = path.getPointAtLength((total * i) / steps);
        const dx = p.x - x;
        const dy = p.y - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
    }
    return Math.sqrt(best);
}

// every shape-hit path stacked under (clientX, clientY), closest first
function shape_hits_at(clientX, clientY) {
    const candidates = document.elementsFromPoint(clientX, clientY)
        .filter((el) => el.classList && el.classList.contains("shape-hit"));
    if (candidates.length <= 1) return candidates;

    return candidates
        .map((el) => {
            const rect = el.ownerSVGElement.getBoundingClientRect();
            const dist = closest_point_on_path(el, clientX - rect.left, clientY - rect.top);
            return { el, dist };
        })
        .sort((a, b) => a.dist - b.dist)
        .map((c) => c.el);
}

function setup_shape_dragging() {
    // listens on #page, not just .maps-grid: the panels are deliberately huge and bleed out
    // underneath the menu (that's how a projection's outline can be visible threading through
    // the menu's gaps), so a drag can legitimately start on top of a menu label. Scoping the
    // listener to the map area alone meant those clicks never reached this code at all — the
    // menu element caught the event first and the browser fell back to selecting its text.
    const surface = document.querySelector("#page");
    if (!surface) return;

    let key = null;
    let start_lat = 0;
    let start_lon = 0;
    let start_x = 0;
    let start_y = 0;

    const on_move = (event) => {
        if (!key) return;
        const dy = event.clientY - start_y;
        let new_lat = start_lat - dy * pixels_degree;
        new_lat = Math.max(-90, Math.min(90, new_lat));

        const dx = event.clientX - start_x;
        // longitude is free to grow past ±360 — the rotation math is periodic, so this
        // stays smooth through the wrap with no clamp or discontinuity
        const new_lon = start_lon + dx * pixels_degree;

        shape_state[key].lat = new_lat;
        shape_state[key].lon = new_lon;

        render_shape(key);
        refresh_shape_row(key);
    };

    const on_up = () => {
        key = null;
        surface.classList.remove("is-dragging");
        window.removeEventListener("pointermove", on_move);
        window.removeEventListener("pointerup", on_up);
    };

    // shows the grab cursor whenever a shape is actually reachable — native CSS :hover can't
    // do this reliably, since with the panels overlapping it only ever reflects whichever
    // panel's stroke happens to be topmost at that exact pixel, not whichever one is closest
    surface.addEventListener("pointermove", (event) => {
        if (key) return; // a drag is already in progress — is-dragging owns the cursor then
        const hits = shape_hits_at(event.clientX, event.clientY);
        const can_grab = hits.some((el) => el.dataset && shape_state[el.dataset.shapeKey]);
        surface.classList.toggle("can-grab", can_grab);
    });

    surface.addEventListener("pointerdown", (event) => {
        const hits = shape_hits_at(event.clientX, event.clientY);
        const target = hits.find((el) => el.dataset && shape_state[el.dataset.shapeKey]);
        if (!target) return; // nothing draggable under the cursor — let the click do whatever it normally does

        key = target.dataset.shapeKey;
        start_lat = shape_state[key].lat;
        start_lon = shape_state[key].lon;
        start_x = event.clientX;
        start_y = event.clientY;

        event.preventDefault(); // blocks native text selection even when the click landed on a menu label
        surface.classList.remove("can-grab"); // mutually exclusive with is-dragging — see the CSS comment on .can-grab for why both being set at once was the bug
        surface.classList.add("is-dragging");
        window.addEventListener("pointermove", on_move);
        window.addEventListener("pointerup", on_up);
    });
}


// look up one shape's floating tags: the lon tag hangs on the top edge, the lat tag
// (with the on/off checkbox) hangs on the right edge.
function shape_row_els(key) {
    const lon_tag = document.querySelector(`.lon-tag[data-shape="${key}"]`);
    const lat_tag = document.querySelector(`.lat-tag[data-shape="${key}"]`);
    if (!lat_tag || !lon_tag) {
        console.warn(`No coordinate tag found for "${key}".`);
        return { remove_btn: null, lat_input: null, lon_input: null, lat_tag: null, lon_tag: null };
    }
    return {
        remove_btn: lat_tag.querySelector(".shape-remove"),
        lat_input: lat_tag.querySelector('.coord-input[data-axis="lat"]'),
        lon_input: lon_tag.querySelector('.coord-input[data-axis="lon"]'),
        lat_tag,
        lon_tag
    };
}

// push a shape's current lat/lon into its tags, and slide each tag along its edge to the
// matching position. Skips whichever field the person is actively typing into.
function refresh_shape_row(key) {
    const { lat_input, lon_input, lat_tag, lon_tag } = shape_row_els(key);
    if (!lat_input || !lon_input) return;
    const state = shape_state[key];
    const lon = wrap_lon(state.lon); // state.lon can exceed ±180 mid-drag; only the readout/position wraps

    if (document.activeElement !== lat_input) lat_input.value = state.lat.toFixed(1);
    if (document.activeElement !== lon_input) lon_input.value = lon.toFixed(1);
    size_coord_input(lat_input);
    size_coord_input(lon_input);

    const lon_percent = ((lon + 180) / 360) * 100; // -180 -> left edge, 180 -> right edge
    lon_tag.style.left = `${Math.max(2, Math.min(98, lon_percent))}%`;

    const lat_percent = ((90 - state.lat) / 180) * 100; // 90 -> top edge, -90 -> bottom edge
    lat_tag.style.top = `${Math.max(2, Math.min(98, lat_percent))}%`;

    deconflict_tags(".lon-overlay", ".lon-tag", "left");
    deconflict_tags(".lat-overlay", ".lat-tag", "top");
}

// a fixed input width left a long stretch of background trailing past short values like
// "0.0" — this sizes it to the value actually shown, plus a small margin, instead
function size_coord_input(input) {
    input.style.width = `${input.value.length + 1}ch`;
}

// when two or more tags land close enough together to overlap, push the later ones apart
// along whichever axis they're actually laid out on — works in actual measured pixels rather
// than crude percentage rounding, which missed collisions whenever 1% of the strip was
// smaller than a tag.
function deconflict_tags(overlaySelector, tagSelector, positionProp) {
    const overlay = document.querySelector(overlaySelector);
    if (!overlay) return;
    const tags = Array.from(overlay.querySelectorAll(tagSelector));
    const margin_prop = positionProp === "left" ? "marginLeft" : "marginTop";

    // clear any previous nudge first — both so a tag that moved away from a collision
    // doesn't leave a stale gap, and so the measurement below reflects each tag's natural,
    // un-nudged position
    tags.forEach((tag) => { tag.style[margin_prop] = ""; });

    const gap = 6; // px of breathing room between adjacent tags

    const with_pos = tags
        .map((tag) => {
            // measured directly off the DOM rather than reconstructed from the tag's own
            // left/top percentage — for a rotated longitude tag, its translateX(-50%) shift
            // is based on its PRE-rotation width, which grows with the text ("Triangle" vs
            // "Square"), so back-calculating from the percentage alone doesn't land on
            // where it actually ends up on screen. .lon-tag-inner is the element the
            // rotation is applied to, so it reports the true on-screen box; latitude tags
            // have no such wrapper and measure correctly on the tag itself.
            const visual = tag.querySelector(".lon-tag-inner") || tag;
            const rect = visual.getBoundingClientRect();
            const natural_start = positionProp === "left" ? rect.left : rect.top;
            const size = positionProp === "left" ? rect.width : rect.height;
            return { tag, natural_start, size };
        })
        .sort((a, b) => a.natural_start - b.natural_start);

    let last_edge = -Infinity;
    with_pos.forEach(({ tag, natural_start, size }) => {
        const placed_start = Math.max(natural_start, last_edge);
        if (placed_start > natural_start) tag.style[margin_prop] = `${placed_start - natural_start}px`;
        last_edge = placed_start + size + gap;
    });
}


// remove one shape entirely — its paths on every panel and both its tags
function remove_shape(key) {
    const { lat_tag, lon_tag } = shape_row_els(key);

    if (shape_paths[key]) {
        Object.values(shape_paths[key]).forEach((paths) => {
            paths.interactive.remove();
            paths.hit.remove();
        });
    }
    if (lat_tag) lat_tag.remove();
    if (lon_tag) lon_tag.remove();

    delete shape_paths[key];
    delete shape_geo[key];
    delete shape_origin[key];
    delete shape_state[key];
    const idx = shapes_setup.findIndex((s) => s.key === key);
    if (idx !== -1) shapes_setup.splice(idx, 1);
}


// wire up one shape's tags: the × button removes the shape entirely, coordinate inputs
// are editable — tap in a number and commit it (blur or Enter) to jump the shape straight there
function wire_shape_row_controls(key) {
    const { remove_btn, lat_input, lon_input } = shape_row_els(key);
    if (!remove_btn || !lat_input || !lon_input) return;

    remove_btn.addEventListener("click", () => remove_shape(key));

    lat_input.addEventListener("input", () => size_coord_input(lat_input));
    lon_input.addEventListener("input", () => size_coord_input(lon_input));

    lat_input.addEventListener("change", () => {
        const parsed = parseFloat(lat_input.value);
        if (Number.isFinite(parsed)) {
            shape_state[key].lat = Math.max(-90, Math.min(90, parsed));
            render_shape(key);
        }
        refresh_shape_row(key);
    });

    lon_input.addEventListener("change", () => {
        const parsed = parseFloat(lon_input.value);
        if (Number.isFinite(parsed)) {
            shape_state[key].lon = wrap_lon(parsed);
            render_shape(key);
        }
        refresh_shape_row(key);
    });
}


// wire up each projection's legend checkbox to show/hide its panel
function setup_projection_controls() {
    projections_setup.forEach((cfg) => {
        const checkbox = document.querySelector(`.projection-toggle[data-projection="${cfg.key}"]`);
        if (!checkbox) return;
        const apply = () => {
            document.querySelector(cfg.selector).style.display = checkbox.checked ? "" : "none";
        };
        checkbox.addEventListener("change", apply);
        apply(); // reflect the checkbox's starting state right away, not just future changes
    });
}


// wire up the limits/grid/land toggles and the "original position" reset button — none of
// these depend on any shape being loaded
function setup_global_controls() {
    const limits_toggle = document.getElementById("toggle-limits");
    if (limits_toggle) {
        const apply = () => {
            document.querySelectorAll(".globe-outline").forEach((el) => {
                el.style.display = limits_toggle.checked ? "" : "none";
            });
        };
        limits_toggle.addEventListener("change", apply);
        apply();
    }

    const grid_toggle = document.getElementById("toggle-grid");
    if (grid_toggle) {
        const apply = () => {
            document.querySelectorAll(".globe-grid").forEach((el) => {
                el.style.display = grid_toggle.checked ? "" : "none";
            });
        };
        grid_toggle.addEventListener("change", apply);
        apply();
    }

    // the land layer doesn't exist yet at this point (it loads asynchronously), so its
    // starting visibility is applied in draw_land_layer instead, once it's created
    const land_toggle = document.getElementById("toggle-land");
    if (land_toggle) {
        land_toggle.addEventListener("change", () => {
            document.querySelectorAll(".globe-land").forEach((el) => {
                el.style.display = land_toggle.checked ? "" : "none";
            });
        });
    }

    const reset_btn = document.getElementById("reset-positions-btn");
    if (reset_btn) {
        reset_btn.addEventListener("click", () => {
            Object.keys(shape_geo).forEach((key) => {
                shape_state[key] = { lat: shape_origin[key].lat, lon: shape_origin[key].lon };
                render_shape(key);
                refresh_shape_row(key);
            });
        });
    }
}


// collapses the footer's intro text down to its first 3 lines (plus a "..." line) or back
// to the full thing — independent of any shape/map data, so it's wired up right at startup
function setup_footer_toggle() {
    const toggle = document.getElementById("footer-toggle");
    const ellipsis = document.getElementById("footer-ellipsis");
    const footer_text = document.querySelector(".footer-text");
    if (!toggle || !ellipsis || !footer_text) return;

    const icon = toggle.querySelector(".add-shape-icon");

    toggle.addEventListener("click", () => {
        const collapsed = footer_text.classList.toggle("collapsed");
        ellipsis.hidden = !collapsed;
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.title = collapsed ? "Expand" : "Collapse";
        if (icon) icon.textContent = collapsed ? "↓" : "↑";
    });
}


// build and insert a new shape's floating lon tag (top edge) and lat+checkbox tag (right
// edge) — both upright now, laid out the same way, just anchored to different edges
// build and insert a new shape's floating lon tag (top edge, rotated like the original
// single-shape label) and lat+checkbox tag (right edge, upright)
function add_shape_rows(key, label) {
    const lon_overlay = document.querySelector(".lon-overlay");
    const lat_overlay = document.querySelector(".lat-overlay");
    if (!lon_overlay || !lat_overlay) return;

    const lon_tag = document.createElement("div");
    lon_tag.className = "lon-tag";
    lon_tag.dataset.shape = key;
    lon_tag.innerHTML = `<div class="lon-tag-inner">`
        + `<span class="shape-name">${label}</span>`
        + `<input type="number" class="coord-input" data-axis="lon" step="0.1" autocomplete="off" />`
        + `</div>`;
    lon_overlay.appendChild(lon_tag);

    const lat_tag = document.createElement("div");
    lat_tag.className = "lat-tag";
    lat_tag.dataset.shape = key;
    lat_tag.innerHTML = `<button type="button" class="shape-remove" title="Remove ${label}">&times;</button>`
        + `<span class="shape-name">${label}</span>`
        + `<input type="number" class="coord-input" data-axis="lat" step="0.1" autocomplete="off" />`;
    lat_overlay.appendChild(lat_tag);
}


// the one path every shape goes through, whether it's a default, a searched country, a
// continent, or a generated geometric shape: register it, compute its starting position,
// build its DOM tags, draw it into every panel, and wire up dragging + editing.
function add_shape(key, label, geometry) {
    if (shape_geo[key]) return; // already added

    shape_geo[key] = geometry;
    const [lon, lat] = d3.geoCentroid(geometry);
    shape_origin[key] = { lat, lon };
    shape_state[key] = { lat, lon };
    shapes_setup.push({ key, label });

    add_shape_rows(key, label);
    add_shape_paths(key);
    render_shape(key);
    refresh_shape_row(key);
    wire_shape_row_controls(key);
}


// --- shared dropdown portal: one floating list used by every dropdown on the page (country,
// continent, shape). Positioned in JS from the anchor's live coordinates rather than CSS, and
// living directly under #page (see the HTML comment above #dropdown-portal) rather than
// nested inside any menu group — that placement, not just its background-color, is what
// actually keeps it from getting trapped beneath a sibling group's own stacking context.
//
// only one of these is ever open at a time: opening a new one closes whatever was open,
// including resetting that dropdown's own toggle/icon state via its close_current callback
// (close_current_dropdown itself is declared up with the rest of the shared state).
//
// row_left/row_top is the box's own final outer position (its border's top-left corner) —
// each caller works out what that should be for its own case (see setup_custom_dropdown and
// setup_country_search below), since a header-wrapping box and a plain below-the-row box
// need different offsets from the thing they're anchored to. header_text, if given
// (continent/shape only), becomes a bold, non-indented first row duplicating the toggle's
// own "↑ label" line — the toggle itself is hidden while open so it isn't drawn twice.
function open_dropdown_portal(row_left, row_top, options, on_pick, on_close, header_text) {
    const portal = document.getElementById("dropdown-portal");
    const page = document.getElementById("page");
    if (!portal || !page) return null;

    if (close_current_dropdown) close_current_dropdown();

    const page_rect = page.getBoundingClientRect();
    portal.style.left = `${row_left - page_rect.left}px`;
    portal.style.top = `${row_top - page_rect.top}px`;

    portal.innerHTML = "";

    if (header_text) {
        const header = document.createElement("div");
        header.className = "dropdown-option dropdown-header";
        header.textContent = header_text;
        header.addEventListener("mousedown", (event) => {
            event.preventDefault();
            close_dropdown();
        });
        portal.appendChild(header);
    }

    options.forEach((name) => {
        const option = document.createElement("div");
        option.className = "dropdown-option";
        option.setAttribute("role", "option");
        option.textContent = name;
        // mousedown (not click) + preventDefault keeps focus on whatever opened this — matters
        // for the country input, which would otherwise blur before the click registers
        option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            close_dropdown();
            on_pick(name);
        });
        portal.appendChild(option);
    });
    portal.hidden = false;

    function close_dropdown() {
        portal.hidden = true;
        portal.innerHTML = "";
        close_current_dropdown = null;
        if (on_close) on_close();
    }
    close_current_dropdown = close_dropdown;
    return close_dropdown;
}

// a click-to-open dropdown (continent, shape): shows its full (short) list of names inside a
// bordered box that also encloses the toggle row's own "↑ label" line (a duplicate rendered
// inside the portal — the real toggle is hidden while open, see open()/close() below), and
// flips the toggle's icon (↓/↑) and weight (bold while open) to match
function setup_custom_dropdown(toggle_id, names, on_pick) {
    const toggle = document.getElementById(toggle_id);
    if (!toggle) return;
    const icon = toggle.querySelector(".add-shape-icon");
    let close = null;

    function open() {
        const toggle_rect = toggle.getBoundingClientRect();
        if (icon) icon.textContent = "↑";
        const header_text = toggle.textContent.replace(/\s+/g, " ").trim();

        close = open_dropdown_portal(
            toggle_rect.left - PORTAL_BORDER_AND_PAD_X,
            toggle_rect.top - PORTAL_BORDER_AND_PAD_TOP,
            names,
            on_pick,
            () => {
                toggle.classList.remove("open");
                toggle.setAttribute("aria-expanded", "false");
                toggle.style.visibility = "";
                if (icon) icon.textContent = "↓";
                close = null;
            },
            header_text
        );
        toggle.classList.add("open");
        toggle.setAttribute("aria-expanded", "true");
        toggle.style.visibility = "hidden"; // the portal's own header row replaces it visually
    }

    toggle.addEventListener("click", () => (close ? close() : open()));
    toggle.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            close ? close() : open();
        }
    });
    document.addEventListener("click", (event) => {
        const portal = document.getElementById("dropdown-portal");
        if (close && !toggle.contains(event.target) && portal && !portal.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && close) close();
    });
}


// --- continent dropdown: pick a continent, get it added as one merged shape -------------

function setup_continent_picker() {
    setup_custom_dropdown("continent-toggle", Object.keys(continent_ids), (name) => {
        const key = slugify(name);
        if (shape_geo[key]) return; // already added

        const members = world_countries.filter((f) => continent_ids[name].has(String(f.id)));
        const merged = union_all(members);
        if (!merged) {
            console.warn(`Couldn't build ${name} from the world atlas data.`);
            return;
        }
        add_shape(key, name, merged);
    });
}


// --- geometric shape dropdown: pick a shape, get a synthetic one added ------------------

function setup_geometric_shape_picker() {
    setup_custom_dropdown("shape-toggle", Object.keys(geometric_shapes), (name) => {
        // each pick gets its own instance, so the same shape can be added more than once
        const key = `${slugify(name)}-${Object.keys(shape_geo).filter((k) => k.startsWith(slugify(name))).length + 1}`;
        const geometry = ensure_winding(geometric_shapes[name]());
        add_shape(key, name, geometry);
    });
}


// --- country search: type a name, get a narrowing list in the same shared dropdown --------

function setup_country_search() {
    const input = document.getElementById("country-search-input");
    if (!input) return;
    let close = null;

    // sized to the value actually shown (or the placeholder, when empty) instead of a fixed
    // rest/focus pair — that fixed pair meant the row's background stayed at its wide
    // "focused" size even right after focusing with nothing typed yet
    function size_input() {
        const length = input.value.length || input.placeholder.length;
        input.style.width = `${length + 1}ch`;
    }
    size_input();

    function pick(name) {
        const match = world_countries.find((f) => f.properties && f.properties.name === name);
        input.value = "";
        size_input();
        if (close) close();
        if (!match) return;
        add_shape(slugify(match.properties.name), match.properties.name, ensure_winding(match));
    }

    function show_matches() {
        size_input();
        const query = input.value.trim().toLowerCase();

        const all_names = world_countries
            .map((f) => f.properties && f.properties.name)
            .filter(Boolean)
            .sort();

        // no query yet (just clicked/focused it) — show the full list rather than nothing,
        // so this reads as an actual dropdown from the first click, same as continent/shape.
        // The portal itself scrolls (max-height + overflow-y) rather than this being capped.
        const matches = query ? all_names.filter((name) => name.toLowerCase().includes(query)) : all_names;

        if (matches.length === 0) {
            if (close) close();
            return;
        }

        const anchor = input.previousElementSibling || input; // the row's icon, for a consistent left edge
        const rect = anchor.getBoundingClientRect();
        const bottom = input.getBoundingClientRect().bottom;
        close = open_dropdown_portal(
            rect.left - PORTAL_BORDER_AND_PAD_X,
            bottom + DROPDOWN_GAP_BELOW_ROW,
            matches,
            pick,
            () => { close = null; }
        );
    }

    input.addEventListener("focus", show_matches);
    input.addEventListener("input", show_matches);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const query = input.value.trim().toLowerCase();
            if (!query) return;
            const match =
                world_countries.find((f) => f.properties && f.properties.name.toLowerCase() === query) ||
                world_countries.find((f) => f.properties && f.properties.name.toLowerCase().startsWith(query));
            if (match) pick(match.properties.name);
            else console.warn(`No country found matching "${input.value}" — keep typing to narrow the list.`);
        } else if (event.key === "Escape" && close) {
            close();
        }
    });
    document.addEventListener("click", (event) => {
        const portal = document.getElementById("dropdown-portal");
        if (close && event.target !== input && portal && !portal.contains(event.target)) close();
    });
}
