
var fs = require('fs');
var bs = require('binarysearch');

var SBOLDocument = require('sboljs');
var terms = SBOLDocument.terms

var parts = JSON.parse(fs.readFileSync('partsWithFeatures.json') + '');
var features = JSON.parse(fs.readFileSync('parts_seq_features.json') + '');

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

var fastalines = []

parts.forEach((part) => {

var seq = part.sequence.trim()

if(seq !== '')
{
    fastalines.push('>' + part.part_name)

    fastalines.push(seq)
}

})

fs.writeFileSync('igem.fasta', fastalines.join('\n'))


