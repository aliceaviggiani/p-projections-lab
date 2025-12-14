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
const path_brazil = "data/brazil-country_limits.geojson";
const panel = panel_size("#page");
const w = panel.width;
const h = panel.height;

let current_offset = 0;
let current_offset_x = 0;
const max_offset = 180;
const pixels_degree = 0.4; // dragging sensibility
const frames = []; // to store projections' info


// loading projections
const projections_setup = [
    {
        key: "mercator",
        selector: "#vis-mercator",
        create: () => d3.geoMercator(),
        width: w,
        scale_factor: 1.0,
        translate: [w / 2, h / 2]
    },
    {
        key: "peters",
        selector: "#vis-peters",
        // selector: ".maps-grid",
        create: () => d3.geoCylindricalEqualArea().parallel(45), // standard 45 parallels
        width: w,
        scale_factor: 1.0,
        translate: [w / 2, h / 2]
    },
    {
        key: "albers",
        selector: "#vis-albers",
        create: () => d3.geoConicEqualArea().parallels([-5, -35]), // parallels adapted to Brazil coordinates
        width: w,
        scale_factor: 1.0,
        translate: [w / 2, h / 10]
    },
    {
        key: "winkel",
        selector: "#vis-winkel",
        create: () => d3.geoWinkel3(),
        width: w,
        scale_factor: 1.0,
        translate: [w / 2, h / 2]
    }
];

// loading shape and creating projections
// data is in geojson, but d3 parses it as json
d3.json(path_brazil)
    .then((geo) => {
        const shape = geo.type === "FeatureCollection" ? geo.features[0] : geo;
        console.log("Feature type:", shape.type);
        console.log("Geometry type:", shape.geometry.type);

        projections_setup.forEach((cfg) => {
            const svg = d3
                .select(cfg.selector)
                .append("svg")
                .attr("width", cfg.width)
                .attr("height", h)

            const projection = cfg.create(); // convert coordinates in x,y 

            // fit shape in layout
            projection.fitSize([cfg.width, h], shape);
            const base_scale = projection.scale(); // to not acumulate the multiplying in every interaction
            projection
                .scale(base_scale * cfg.scale_factor)
                .translate([cfg.translate[0], cfg.translate[1]]);

            // create the path to create the string
            const path_create = d3.geoPath(projection);

            // rendering the shape
            // original fixed
            const path_outline = svg
                .append("path")
                .datum(shape)
                .attr("class", "brazil-outline")
                .attr("fill", "none")
                .attr("d", path_create);

            // distortion
            const path_element = svg
                .append("path")
                .datum(shape)
                .attr("fill", "none")
                .attr("stroke-width", 2)
                .attr("stroke-linejoin", "round")
                .attr("d", path_create) // create the string

            // appending objects to the array
            frames.push({
                cfg,
                svg,
                projection,
                path_create,
                path_element,
                path_outline,
                base_scale
            });
        });

        // back to initial position
        update_all(shape);
        setup_drag(shape);
    })


// create the dragging 
function setup_drag(shape) {
    let start_offset = 0;
    let start_y = 0;
    let start_offset_x = 0;
    let start_x = 0;

    d3.select(".maps-grid").call(
        d3
            .drag()
            .on("start", (event) => {
                start_offset = current_offset;
                start_y = event.y;
                start_offset_x = current_offset_x;
                start_x = event.x;
            })
            .on("drag", (event) => {
                const dy = event.y - start_y;
                let new_offset = start_offset - dy * pixels_degree;
                new_offset = Math.max(-max_offset, Math.min(max_offset, new_offset));
                current_offset = new_offset;

                const dx = event.x - start_x;
                let new_offset_x = start_offset_x + dx * pixels_degree;
                new_offset_x = Math.max(-max_offset, Math.min(max_offset, new_offset_x));
                current_offset_x = new_offset_x;

                update_all(shape);
            })
    );
}

// reset
function update_all(original_shape) {
    const shifted_lat = shift_lat(original_shape, current_offset, current_offset_x);

    frames.forEach((frame) => {
        const { projection, path_create, path_element } = frame;
        path_element
            .datum(shifted_lat)
            .attr("d", path_create);
    });

    // storing virtuals lat and long
    d3
        .select("#label-latitude")
        .text(current_offset.toFixed(1) + "°");
    d3
        .select("#label-longitude")
        .text(current_offset_x.toFixed(1) + "°");

    // moable label
    const label_offset_per = (current_offset / max_offset) * 40; // max movement to not cover the texts
    d3.select(".latitude-label")
        .style("top", `calc(50% - ${label_offset_per}%)`); // so the lat is in the center when lat=0
    const longitude_offset_per = (current_offset_x / max_offset) * 40;
    d3.select(".longitude-label")
        .style("left", `calc(50% + ${longitude_offset_per}%)`);
}

// changing lat and long
function shift_lat(feature, offset_deg, offset_deg_x) {
    return {
        type: feature.type,
        properties: feature.properties,
        geometry: {
            type: feature.geometry.type,
            coordinates: shift_coords(feature.geometry.coordinates, offset_deg, offset_deg_x)
        }
    };
}

// shifting all latitudes and longitudes at once
function shift_coords(coords, offset_deg, offset_deg_x) {
    if (typeof coords[0][0] === "number") {
        return coords.map(([lon, lat]) => {
            let new_lat = lat + offset_deg;
            new_lat = Math.max(-90, Math.min(90, new_lat));
            let new_lon = lon + offset_deg_x;
            new_lon = Math.max(-180, Math.min(180, new_lon));
            return [new_lon, new_lat];
        });
    } else {
        return coords.map((c) => shift_coords(c, offset_deg, offset_deg_x));
    }
}