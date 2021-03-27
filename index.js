const fs = require('fs');

//console.log(region);

const DelftBounds = {
    min_lat: 51.958235,
    max_lat: 52.059316,
    min_lon: 4.296022,
    max_lon: 4.4475827
};

var iitcFile = process.argv[2] ? process.argv[2] : "./data/IITC-pogo_2021-03-02.json"; 
var ingressLocations = require(iitcFile);
var blancheStops = require('./data/Pokestops.json');
var blancheGyms = require('./data/Gyms.json');

var regions = ["centrum", "hof van delft", "voordijkshoorn", "tu wijk", "voorhof", "buitenhof", "tanthof west", "tanthof oost", "delfgauw", "vrijenban", "delftse hout", "ruiven", "sion - haantje"]
var gyms = blancheGyms.filter(g => g.description != "Bestaat niet meer" && regions.some( r => g.region && r == g.region.toLowerCase()));
var gymsdict = gyms.reduce((acc, curr) => { if(acc[curr.region]) {acc[curr.region].push(curr.name);}else{acc[curr.region] = [curr.name];} return acc;}, {});


var ingressGyms = Object.values(ingressLocations.gyms);
var ingressPokestops = Object.values(ingressLocations.pokestops);

ingressGyms = withinBounds(ingressGyms, DelftBounds);
ingressPokestops = withinBounds(ingressPokestops, DelftBounds);

blancheGyms = removeSpacesFromNames(blancheGyms);
blancheStops = removeSpacesFromNames(blancheStops);
ingressGyms = removeSpacesFromNames(ingressGyms);
ingressPokestops = removeSpacesFromNames(ingressPokestops);

blancheStops = updateStopsToGyms(blancheStops, ingressGyms);


updateNameAndLocationOnGuid(ingressGyms, blancheGyms);
updateNameAndLocationOnGuid(ingressPokestops, blancheStops);

updateLocationMatchOnName(ingressGyms, blancheGyms);
updateLocationMatchOnName(ingressPokestops, blancheStops);

addGuidPropertyWhenLocationMatches(ingressGyms, blancheGyms);
addGuidPropertyWhenLocationMatches(ingressPokestops, blancheStops);

var gymsBoth = inBoth(blancheGyms, ingressGyms);
var gymsIngress = inFirstOnly(ingressGyms, blancheGyms);
var gymsPogo = inSecondOnly(ingressGyms, withinBounds(blancheGyms, DelftBounds));
var stopsBoth = inBoth(blancheStops, ingressPokestops);
var stopsIngress = inFirstOnly(ingressPokestops, blancheStops); 
var stopsPogo = inSecondOnly(ingressPokestops, withinBounds(blancheStops, DelftBounds)); 

console.log(`${gymsBoth.length} already pressent in Blanche gyms file!`);
console.log(`${gymsIngress.length} missing in Blanche gyms file. Adding them now`);
console.log(gymsIngress.map(x => `${x.name} (${x.lat}, ${x.lng})`).join("\n"));
let gymsOutput = addGyms(gymsIngress);

console.log(`${stopsBoth.length} already pressent in Blanche stops file!`);
console.log(`${stopsIngress.length} missing in Blanche stops file. Adding them now`);
console.log(stopsIngress.map(x => `${x.name} (${x.lat}, ${x.lng})`).join("\n"));
let stopsOutput = addStops(stopsIngress);

// Sorting
gymsOutput = gymsOutput.sort((a, b) => a.name.localeCompare(b.name));
stopsOutput = stopsOutput.sort((a, b) => a.name.localeCompare(b.name));

// warnings:
console.log(gymsPogo.length + " gyms in Gyms.json that are not present in Ingress data. Listing them now:");
console.log(gymsPogo.map(x => `${x.name} (${x.lat}, ${x.lon})`).join("\n"));
console.log(stopsPogo.length + " stops in Pokestops.json that are not present in Ingress data. Listing them now:");
console.log(stopsPogo.map(x => `${x.name} (${x.lat}, ${x.lon})`).join("\n"));

//checking keys
verifyKeys();
updateRegion();

fs.writeFileSync('data/OUTPUTGyms.json', JSON.stringify(gymsOutput, null, '\t'));
fs.writeFileSync('data/OUTPUTPokestops.json', JSON.stringify(stopsOutput, null, '\t'));

function verifyKeys(){
    var combined = gymsOutput.concat(stopsOutput);

    combined.forEach((loc, index) => {
        verifyKeyMatchesStartOfName(loc);
        verifyLocationsHaveUniqueKeys(loc, combined);
        verifyIdenticalNamesHaveIdenticalKeys(loc, index, combined);
        verifyKeyDoesNotMatchStartOfOtherLocation(loc, combined);
        verifyContainsKeyWithoutSpecialCharacters(loc);
        
        if(!loc.guid){
            console.log(`Warning: ${loc.name} does not have a corresponding location in ingress data.`);
        }
    });
}

function verifyKeyMatchesStartOfName(loc){
    if (!loc.keys.some(key => loc.name.toLowerCase().startsWith(key))){
        console.warn(`${loc.name} does not include a key that exactly matches the start of the name.`);
    }
}

function verifyLocationsHaveUniqueKeys(loc, list) {
    let distinctList = list.filter(l => l.name.toLowerCase() != loc.name.toLowerCase());
    let containsUniqueKey = !loc.keys.every(key => 
        loc.name.toLowerCase().startsWith(key) && 
        loc.name.toLowerCase() != key &&
        distinctList.some(otherLoc => otherLoc.keys.includes(key)));
    if (!containsUniqueKey) {
        console.warn(`${loc.name} does not have any unique key, even though its name is unique.`)
    }
}

function verifyIdenticalNamesHaveIdenticalKeys(loc, index, list){
    let sameList = list.filter((otherLoc, otherIndex) => otherLoc.name.toLowerCase() == loc.name.toLowerCase() && otherIndex != index);
    let allKeysMatch = loc.keys.every(key => sameList.every(otherLoc => otherLoc.keys.includes(key)));
    if (!allKeysMatch){
        console.warn(`There are multiple locations with name ${loc.name}, but they don't have identical keys.`);
    }
}

function verifyKeyDoesNotMatchStartOfOtherLocation(loc, list){
    let incorrectKey = loc.keys.find(key => 
        // Make an exception when that key is already the full name of the location
        key != loc.name.toLowerCase() &&
        !list.filter(otherLoc => otherLoc.name.toLowerCase().startsWith(key) &&
            // Exception when one of the locations is a gym
            ((loc.park != undefined && otherLoc.park != undefined) || (loc.park == undefined && otherLoc.park == undefined)))
            .every(otherLoc => otherLoc.keys.includes(key)));
    if (incorrectKey){
        console.warn(`${loc.name} contains a key (\`${incorrectKey}\`) that is identical to the start of another location, however that location does not have that key.`);
    }
}

function verifyContainsKeyWithoutSpecialCharacters(loc){
    includesKeyWithoutFancyCharacters = loc.keys.some(key => /^[a-z0-9-\s\.\,\:\(\)\[\]\/\?]+$/.test(key));
    if (!includesKeyWithoutFancyCharacters){
        console.warn(`${loc.name} only contains keys with special characters. This will make it difficult to find.`);
    }
}

function withinBounds(i, bounds){
    return i.filter(l => l.lat >= bounds.min_lat && l.lat <= bounds.max_lat &&
        ( (l.lng >= bounds.min_lon && l.lng <= bounds.max_lon) || (l.lon >= bounds.min_lon && l.lon <= bounds.max_lon) ));
}

function addGyms(gymsIngress){
    return blancheGyms.concat(gymsIngress.map(x => {
        var sameName = blancheGyms.concat(blancheStops).find(g => g.name.toLowerCase() == x.name.toLowerCase());
        return {
            keys: sameName ? sameName.keys : [x.name.toLowerCase().substring(0, 16).trim()],
            name: x.name,
            region: "",
            lat: x.lat,
            lon: x.lng,
            description: "",
            park: x.isEx ? 1 : 0,
            problem: 0,
            guid: x.guid,
            dateAdded: new Date().toISOString().substring(0, 10)
        }
    }));
}

function addStops(stopsIngress){
    return blancheStops.concat(stopsIngress.map(x => {
        var sameName = blancheGyms.concat(blancheStops).find(s => s.name.toLowerCase() == x.name.toLowerCase());
        return {
            keys: sameName ? sameName.keys : [x.name.toLowerCase().substring(0, 16).trim()],
            name: x.name,
            region: "",
            lat: x.lat,
            lon: x.lng,
            description: "",
            problem: 0,
            guid: x.guid
        }
    }));
}

function addGuidPropertyWhenLocationMatches(ingress, blanche){
    blanche.forEach(b => {
        var blancheLocMatch = ingress.find(i => i.lat == b.lat && i.lng == b.lon);
        if (blancheLocMatch){
            b.guid = blancheLocMatch.guid;

            fixNameCasing(blancheLocMatch, b);
        }
    });
}

function updateNameAndLocationOnGuid(ingress, blanche){
    blanche.forEach(b => {
        if (b.guid){
            var ingressMatch = ingress.find(i => i.guid == b.guid);
            if (ingressMatch) {
                fixNameCasing(b, ingressMatch);
                
                if (ingressMatch.lat != b.lat || ingressMatch.lng != b.lon){
                    b.lat = ingressMatch.lat;
                    b.lon = ingressMatch.lng;
                }
            }
        }
    });
}

function removeSpacesFromNames(list){
    return list.map(loc => {
        if (/\s\s/g.test(loc.name) || /\s$/g.test(loc.name)){
            console.log(`removed spaces: ${loc.guid} ${loc.name} (${loc.lat}, ${loc.lng})`);
        }
        loc.name = loc.name.replace(/\s+/g, " ").trim();
        return loc;
    });
}

function updateStopsToGyms(stops, ingressGyms){
    var stopsToRemove = [];
    stops.forEach(stop => {
        var matchesOnName = ingressGyms.filter(gym => stop.name.toLowerCase() == gym.name.toLowerCase());
        if (matchesOnName.length > 0)
        {
            var nearestMatch = getNearestLocation(matchesOnName, stop);

            if( Math.abs(nearestMatch.lat - stop.lat) < 0.002 && Math.abs(nearestMatch.lng - stop.lon) < 0.002){  
                let gym = stop;
                gym.park = 0;
                gym.dateAdded = new Date().toISOString().substring(0, 10);
                blancheGyms.push(gym);
                stopsToRemove.push(stop);
                console.log(stop.name + " will be updated to a Gym in Blanche, and removed from the Pokestops file");
            } else {
                console.log(`Skipping stop ${stop.name}, because it's not close to the gym with the same name`);
            }
        }
    });

    return stops.filter(stop => !stopsToRemove.some(str => str.lat == stop.lat && str.lon == stop.lon));
}

function updateLocationMatchOnName(list1, list2){
    list2.forEach(loc2 => {
        var matchesOnName = list1.filter(loc1 => loc2.name.toLowerCase() == loc1.name.toLowerCase());

        if (matchesOnName.length > 0)
        {
            var nearestMatch = getNearestLocation(matchesOnName, loc2);

            if( Math.abs(nearestMatch.lat - loc2.lat) > 0.002 || Math.abs(nearestMatch.lng - loc2.lon) > 0.002){
                console.log(`Skipping ${loc2.name}, because the ingress location is not close to pogo location`);
            }
            else{
                nearestMatch = fixNameCasing(nearestMatch, loc2);
                loc2.lat = nearestMatch.lat;
                loc2.lon = nearestMatch.lng;
            }
        }
    });
}

function fixNameCasing(target, source){
    if(target.name != source.name){
        console.log(`Updating name of location: ${target.name} -> ${source.name}`);
        target.name = source.name;
    }

    return target;
}

function getNearestLocation(list, target){
    return list.sort((a, b) => {
        var aValue = ( a.lat - target.lat ) * ( a.lat - target.lat ) + ( a.lng - target.lon ) * ( a.lng - target.lon );
        var bValue = ( b.lat - target.lat ) * ( b.lat - target.lat ) + ( b.lng - target.lon ) * ( b.lng - target.lon );

        return aValue - bValue;
    })[0];
}

function operation(list1, list2, isUnion) {
    var result = [];
    
    for (var i = 0; i < list1.length; i++) {
        var item1 = list1[i],
            found = false;
        for (var j = 0; j < list2.length && !found; j++) {
            let lon1 = item1.lon ? item1.lon : item1.lng;
            let lon2 = list2[j].lon ? list2[j].lon : list2[j].lng;
            found = lon1 === lon2 && item1.lat === list2[j].lat;
        }
        if (found === !!isUnion) { // isUnion is coerced to boolean
            result.push(item1);
        }
    }
    return result;
}

// Following functions are to be used:
function inBoth(list1, list2) {
    return operation(list1, list2, true);
}

function inFirstOnly(list1, list2) {
    return operation(list1, list2);
}

function inSecondOnly(list1, list2) {
    return inFirstOnly(list2, list1);
}

function updateRegion(options){
    options = {};
    options.useKML = true;
    options.file = "./GebiedenRond_Delft2020-02-11.kml";
    options.layer = "alles2020_02_11";

    if (options.useML){

    } else if (options.useKML) {
        if (!options.file) {
            return;
        }

        updateRegionUsingKMLFile(options.file, options.layer)
    }
}


function updateRegionUsingKMLFile(file, layer){
    const convert = require('xml-js');
    const inside = require('point-in-polygon');
    
    var json = convert.xml2json(fs.readFileSync(file), {compact: true, spaces: 4});
    var data = JSON.parse(json);

    let folder = data.kml.Document.Folder;
    /*if (layer) {
        console.log("Using layer " + layer);
        folder = data.kml.Document.Folder.find(folder => folder.name._text == layer);
    } else {
        console.log("Taking the first layer since none was specified");
        folder = data.kml.Document.Folder[0];
    }*/
    var regions = folder.Placemark.map(region => {
        return {
            name: region.name._text,
            polygon: region.Polygon.outerBoundaryIs.LinearRing.coordinates._text.split(" ").map(line => {
                let arr = line.trim().split(",");
                if (arr.length == 3){
                    return [ Number(arr[1]), Number(arr[0]) ];
                }
            }).filter(elm => elm)
        };
    });

    var combined = gymsOutput.concat(stopsOutput);

    //let withoutRegionList = combined.filter(l => !l.region || l.region == "");

    combined.forEach(loc => {
        let region = regions.find(region => inside([ loc.lat, loc.lon ], region.polygon));
        if (region && region.name) {
            loc.region = region.name
        } else {
            console.warn(`Region for ${loc.name} (${loc.lat}, ${loc.lon}) could not be determined.`);
        }

        if(loc.dateAdded && (
        loc.region != "Centrum" &&
        loc.region != "Vrijenban" &&
        loc.region != "Hof van Delft" &&
        loc.region != "Voorhof" &&
        loc.region != "TU Wijk" &&
        loc.region != "Buitenhof" &&
        loc.region != "Voordijkshoorn" &&
        loc.region != "Delftse Hout" &&
        loc.region != "Tanthof Oost" &&
        loc.region != "Ruiven" &&
        loc.region != "Sion - Haantje" &&
        loc.region != "Schipluiden" &&
        loc.region != "Den Hoorn" &&
        loc.region != "Tanthof West" &&
        loc.region != "Delfgauw" 
        )){
            loc.dateAdded = undefined;
        }
    });
}

function updateRegionUsingML(){
    const KNN = require('ml-knn');
    var combined = gymsOutput.concat(stopsOutput);

    let withRegionList = combined.filter(l => l.region && l.region != "");
    let withoutRegionList = combined.filter(l => !l.region || l.region == "");
    var knn = new KNN(withRegionList.map(l => [l.lat, l.lon]), withRegionList.map(l => l.region));

    var predictions = knn.predict(withoutRegionList.map(l => [l.lat, l.lon]));
    
    predictions.forEach((pred, i) => withoutRegionList[i].region = pred);
}