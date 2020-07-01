
var fs = require('fs');
var bs = require('binarysearch');
var moment = require('moment')

var SBOLDocument = require('sboljs');
var terms = SBOLDocument.terms

var parts = JSON.parse(fs.readFileSync('parts.json') + '');
var features = JSON.parse(fs.readFileSync('parts_seq_features.json') + '');
var teams = JSON.parse(fs.readFileSync('teams.json') + '');

var assert  = require('assert')

var isAlphanumeric = require('is-alphanumeric')

const igemNS = 'http://synbiohub.org/igem/'

var CDs = {}
var depthCache = {}

var collections = {}

var bioBricks = {};

parts.forEach(function(part) {
    bioBricks[part.part_name] = part;
});

parts = parts.sort(function(a, b) {
    return a.part_id - b.part_id
})

for(var i = 0; i < features.length; ++ i) {

    var feature = features[i];

    if(feature.part_id == 0)
        continue;

    var fp = getParts(feature.part_id);

    fp.forEach(function(part) {
       
        if(part.features === undefined)
            part.features = [];

        part.features.push(feature.feature_id);
    });
}

fs.writeFileSync('partsWithFeatures.json', JSON.stringify(parts, null, 2));

function getParts(id) {
    return parts.filter(function(part) {
        return part.part_id == id;
    });
}


