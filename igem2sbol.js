
var fs = require('fs');
var bs = require('binarysearch');
var moment = require('moment')

var SBOLDocument = require('sboljs');
var terms = SBOLDocument.terms

var parts = JSON.parse(fs.readFileSync('partsWithFeatures.json') + '');
var features = JSON.parse(fs.readFileSync('parts_seq_features.json') + '');
var sprot = JSON.parse(fs.readFileSync('sprot.json') + '');

var assert  = require('assert')

var isAlphanumeric = require('is-alphanumeric')

const igemNS = 'https://synbiohub.org/public/igem/'
const igemTermNS = 'http://wiki.synbiohub.org/wiki/Terms/igem#'
const sbhTermNS = 'http://wiki.synbiohub.org/wiki/Terms/synbiohub#'
const provNS = 'http://www.w3.org/ns/prov#'
const dcNS = 'http://purl.org/dc/elements/1.1/'
const dcTermsNS = 'http://purl.org/dc/terms/'

var CDs = {}
var Seqs = {}
var depthCache = {}

var collections = {}

var bioBricks = {};

var partIds = {};

parts.forEach(function(part) {
    bioBricks[part.part_name] = part;
});

parts = parts.sort(function(a, b) {
    return a.part_id - b.part_id
})

parts.forEach(function(part) {
    partIds[part.part_id] = part;
});

function getParts(id) {
    return parts.filter(function(part) {
        return part.part_id == id;
    });
}

features = features.sort(function(a, b) {

    return a.feature_id - b.feature_id;
});

function getFeature(id) {

    return features[bs(features, id, function(value, find) {

        if(value.feature_id > find)
            return 1;
        else if(value.feature_id < find)
            return -1;
        return 0;
    })];
}


function parseTime(time) {

    return moment.utc(time, 'YYYY-MM-DDThh:mm:ss.SSSZ')

}

var start = parseInt(process.argv[2]);
var end = parseInt(process.argv[3]);

for(var i = start; i < end; ++ i)
{
    if (i >= parts.length) return;
    var part = parts[i];

    console.log('Part: ' + part.part_id + ' (' + part.part_name + ')')

    collections = {}

    var sbol = partToSBOL(part);

    pruneTransitiveAnnotations(sbol)

    var igemcoll = sbol.collection()		
 		
    igemcoll.persistentIdentity = igemNS + 'igem_collection'		
    igemcoll.name = 'iGEM Parts Registry'
    igemcoll.description = 'The iGEM Registry is a growing collection of genetic parts that can be mixed and matched to build synthetic biology devices and systems.  As part of the synthetic biology community\'s efforts to make biology easier to engineer, it provides a source of genetic parts to iGEM teams and academic labs.'	
    igemcoll.wasDerivedFrom = 'http://parts.igem.org'
    igemcoll.addUriAnnotation(provNS + 'wasGeneratedBy', 'https://synbiohub.org/public/igem/igem2sbol/1')
    igemcoll.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/myers')
    igemcoll.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/james')
    igemcoll.addDateAnnotation('http://purl.org/dc/terms/created', "2017-04-03T15:00:00.000Z")   
    igemcoll.version = '1'		
    igemcoll.displayId = 'igem_collection'		
    igemcoll.uri = igemcoll.persistentIdentity + '/' + igemcoll.version		

    sbol._componentDefinitions.forEach((cd) => {		
 	
        igemcoll.addMember(cd)
	cd.addUriAnnotation(sbhTermNS + 'topLevel', cd.uri)
	cd.components.forEach((component) => {
	    component.addUriAnnotation(sbhTermNS + 'topLevel', cd.uri)
	})
	cd.sequenceAnnotations.forEach((sa) => {
	    sa.addUriAnnotation(sbhTermNS + 'topLevel', cd.uri)
	    sa.locations.forEach((loc) => {
		loc.addUriAnnotation(sbhTermNS + 'topLevel', cd.uri)
	    })
	})

    })		
  	
    sbol._sequences.forEach((seq) => {		
 	
        igemcoll.addMember(seq)		
	seq.addUriAnnotation(sbhTermNS + 'topLevel', seq.uri)
 	
    })		
  	
    sbol._collections.forEach((col) => {		
	
	col.addUriAnnotation(sbhTermNS + 'topLevel', col.uri)
 	if (col.uri != igemcoll.persistentIdentity + '/' + igemcoll.version) {
	    igemcoll.addMember(col)		
	}
    })		
 	
    var cat = collections[igemNS + 'categories/1'];		
    if(cat != undefined) {		
	igemcoll.addMember(sbol.lookupURI(igemNS+'categories/1'))		
    }

    var xml = sbol.serializeXML({
        'xmlns:igem': igemTermNS,
        'xmlns:sbh': sbhTermNS,
        'xmlns:dc': dcNS,
        'xmlns:rdfs': 'http://www.w3.org/2000/01/rdf-schema#'
    });

    var filename = './out/' + part.part_id + '_' + part.part_name + '.xml';

    fs.writeFileSync(filename, xml);

    console.log('Written: ' + filename);
}

function partToSBOL(part) {

    var sbol = new SBOLDocument();

    partToComponentDefinition(sbol, part, true);

    return sbol;
}

function pruneTransitiveAnnotations(sbol) {
    
    var componentDefinitions = sbol.componentDefinitions.sort((a, b) => {

        return depth(a) - depth(b)

    })

    var found = {}

    var prune = {}

    sbol._componentDefinitions = componentDefinitions.sort((a, b) => {

        return depth(b) - depth(a)

    })

    componentDefinitions.forEach((componentDefinition) => {

        componentDefinition._sequenceAnnotations
            = componentDefinition._sequenceAnnotations.filter((sequenceAnnotation) => {

                if(childHasMatching(componentDefinition, sequenceAnnotation)) {

                    prune[sequenceAnnotation.uri + ''] = true
                    return false
                }

                return true
            })

        componentDefinition._components
            = componentDefinition._components.filter((component) => {

            var contained = false

            componentDefinition._sequenceAnnotations.forEach((sequenceAnnotation) => {

                if(sequenceAnnotation.component === component)
                    contained = true

            })

            if(!contained) {
                prune[component.definition.uri + ''] = true
            }

            return contained
        })

    })

    console.log('Prune list: ')
    console.log(JSON.stringify(Object.keys(prune), null, 2))
}

function depth(componentDefinition) {

    if(depthCache[componentDefinition.uri])
        return depthCache[componentDefinition.uri]

    var c = componentDefinition.components

    var d

    if(c.length > 0) { 

        d = Math.max.apply(Math, c.map((component) => {

            return depth(component.definition)
            
        })) + 1

    } else {

        d = 1

    }

    console.log('depth of ' + componentDefinition.uri + ' is ' + d)

    depthCache[componentDefinition.uri] = d

    return d
}

// if this returns true for SA, SA is toast
//
function childHasMatching(componentDefinition, sequenceAnnotation) {

    var yes = false

    // go through the other annotations in this CD.
    // look at the CD for each other annotation
    // if it contains an annotation that matches what this SA is trying to
    // annotate, we are redundant
    //
    componentDefinition.sequenceAnnotations.forEach((siblingAnnotation) => {

        if(sequenceAnnotation === siblingAnnotation)
            return

        if(siblingAnnotation.component.toString().length === 0)
            return

        //console.log(siblingAnnotation.component)
        //console.log(siblingAnnotation.definition)

        var siblingDefinition = siblingAnnotation.component.definition

        siblingDefinition.sequenceAnnotations.forEach((childAnnotation) => {


        //if(childAnnotation.component.toString().length === 0)
            //return

            //var childDefinition = childAnnotation.component.definition

            var startRelativeToParent = childAnnotation.locations[0].start + siblingAnnotation.locations[0].start - 1
            var endRelativeToParent = childAnnotation.locations[0].end + siblingAnnotation.locations[0].start - 1
            
            /*console.log('candidate for ' + annoDef.name +
                            ' at ' + startRelativeToParent +
                                ' vs ' + sequenceAnnotation.locations[0].start +
                            ' at ' + endRelativeToParent +
                                ' vs ' + sequenceAnnotation.locations[0].end +
                                    ', name is ' + childDefinition.name +
                                        ', type is ' + childDefinition.types[0] + ' vs ' + annoDef.types[0].toString() )*/

            //console.log('looking whether to prune ' + sequenceAnnotation.uri)
            //console.log('got child ' + childAnnotation.uri)

            if(sequenceAnnotation.roles.length > 0)
            {
                if(childAnnotation.roles.length > 0)
                {
                    if(startRelativeToParent === sequenceAnnotation.locations[0].start
                            && endRelativeToParent === sequenceAnnotation.locations[0].end
                            && sequenceAnnotation.roles[0].toString() === childAnnotation.roles[0].toString())
                    {
                        //console.log('thats a match!')
                        yes = true

                    } else {
                        //console.log('not a match')

                    }
                }
            }
            else
            {
                if(childAnnotation.component.toString() !== '' && sequenceAnnotation.component.toString() !== '')
                {
                    if(startRelativeToParent === sequenceAnnotation.locations[0].start
                            && endRelativeToParent === sequenceAnnotation.locations[0].end
                            && sequenceAnnotation.component.definition.toString() === childAnnotation.component.definition.toString())
                    {
                        //console.log('thats a match!')
                        yes = true

                    } else {
                        //console.log('not a match')

                    }
                }
            }

        })
    })


    /*
    if(!yes) {
        console.log('no match for ' + annoDef.name + ' in direct children of ' + componentDefinition.name)
    }*/

    return yes
}

function partToComponentDefinition(sbol, part, root) {

    var cdUri = igemNS + part.part_name.replace(/[\W]+/g,"_");

//    if(CDs[cdUri]) {
        // CJM - can comment out the line below, when not needing complete individual SBOL files for each part
//	sbol._componentDefinitions.push(CDs[cdUri]);
//        sbol._sequences.push(Seqs[cdUri]);
//	return CDs[cdUri]
//    }
    const cats = part.categories.split(' ').map((cat) => cat.trim())

    var componentDefinition = sbol.componentDefinition();
    componentDefinition.addType(terms.dnaRegion);

    componentDefinition.isRoot = root

    if(part.nickname.trim().length > 0) 
        componentDefinition.name = part.nickname.trim()
    else
        componentDefinition.name = part.part_name;

    var sprotMapping = sprot[part.part_id + '_' + part.part_name]

    if(sprotMapping) {
        sprotMapping.forEach((accession) => {
            componentDefinition.addUriAnnotation('http://www.w3.org/2000/01/rdf-schema#seeAlso', 'http://www.uniprot.org/uniprot/' + accession)
        })
    }


    componentDefinition.displayId = part.part_name.replace(/[\W]+/g,"_");
    componentDefinition.persistentIdentity = cdUri
    componentDefinition.version = '1'
    componentDefinition.uri = cdUri + '/' + componentDefinition.version
    componentDefinition.wasDerivedFrom = 'http://parts.igem.org/Part:' + part.part_name;
    componentDefinition.addUriAnnotation(provNS + 'wasGeneratedBy', 'https://synbiohub.org/public/igem/igem2sbol/1')
    componentDefinition.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/myers')
    componentDefinition.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/james')
    componentDefinition.description = part.short_desc.trim();

    //CDs[cdUri] = componentDefinition

    if(part.description.trim().length > 0)
        componentDefinition.addHtmlAnnotation(sbhTermNS + 'mutableDescription', part.description.trim());

    if(part.author.trim().length > 0)
        componentDefinition.addStringAnnotation(dcNS + 'creator', part.author.trim());

    if(part.status.trim().length > 0)
        componentDefinition.addUriAnnotation(igemTermNS + 'status', igemTermNS + 'status/' + part.status.trim());

    if(part.part_status.trim().length > 0)
        componentDefinition.addStringAnnotation(igemTermNS + 'partStatus', part.part_status.trim());

    if(part.sample_status.trim().length > 0)
        componentDefinition.addStringAnnotation(igemTermNS + 'sampleStatus', part.sample_status.trim());

    componentDefinition.addStringAnnotation(igemTermNS + 'dominant', part.dominant===0?'false':'true');

    componentDefinition.addStringAnnotation(igemTermNS + 'discontinued', part.discontinued===0?'false':'true');
    if (part.discontinued > 1) {
        componentDefinition.addUriAnnotation(dcTermsNS + 'isReplacedBy', igemNS + partIds[part.discontinued].part_name.replace(/[\W]+/g,"_")+'/1');
    }
    
    componentDefinition.addStringAnnotation(sbhTermNS + 'bookmark', part.favorite===0?'false':'true');
    componentDefinition.addStringAnnotation(sbhTermNS + 'star', part.rating===0?'false':'true');

    // TODO: temporary
    componentDefinition.addStringAnnotation(igemTermNS + 'owning_group_id', part.owning_group_id)
    componentDefinition.addStringAnnotation(igemTermNS + 'owner_id', part.owner_id)
    componentDefinition.addStringAnnotation(igemTermNS + 'm_user_id', part.m_user_id)
    componentDefinition.addStringAnnotation(igemTermNS + 'group_u_list', part.group_u_list)

    if(part.source.trim().length > 0)
        componentDefinition.addStringAnnotation(sbhTermNS + 'mutableProvenance', part.source.trim());

    if(part.creation_date.trim().length > 0) {

        var creatz = parseTime(part.creation_date.trim())

        if(creatz.isValid()) {

            componentDefinition.addDateAnnotation(dcTermsNS + 'created', creatz.format('YYYY-MM-DDThh:mm:ssZ'))
        }

    }

    // TODO use a date
    if(part.m_datetime.trim().length > 0) {

        var modifiedz = parseTime(part.m_datetime.trim())

        if(modifiedz.isValid()) {

            componentDefinition.addDateAnnotation(dcTermsNS + 'modified', modifiedz.format('YYYY-MM-DDThh:mm:ssZ'))

        }

    }

    // TODO use an int
    //componentDefinition.addStringAnnotation(igemNS + 'uses', part.uses);

    if(part.works.trim().length > 0)
        componentDefinition.addUriAnnotation(igemTermNS + 'experience', igemTermNS + 'experience/' + part.works.trim());

    if(part.part_type.trim().length > 0) {

        componentDefinition.addRole(igemTermNS+'partType/' + part.part_type.trim());

        var soTermz = {
            "Basic": "http://identifiers.org/so/SO:0000316",
            "Cell": "http://identifiers.org/so/SO:0000340",
            "Coding": "http://identifiers.org/so/SO:0000316",
            "Composite": "http://identifiers.org/so/SO:0000804",
            "Conjugation": "http://identifiers.org/so/SO:0000724",
            "Device": "http://identifiers.org/so/SO:0000804",
            "DNA": "http://identifiers.org/so/SO:0000110",
            "Generator": "http://identifiers.org/so/SO:0000804",
            "Intermediate": "http://identifiers.org/so/SO:0000804",
            "Inverter": "http://identifiers.org/so/SO:0000804",
            "Measurement": "http://identifiers.org/so/SO:0000804",
            "Other": "http://identifiers.org/so/SO:0000110",
            "Plasmid": "http://identifiers.org/so/SO:0000155",
            "Plasmid_Backbone": "http://identifiers.org/so/SO:0000755",
            "Primer": "http://identifiers.org/so/SO:0000112",
            "Project": "http://identifiers.org/so/SO:0000804",
            "Protein_Domain": "http://identifiers.org/so/SO:0000417",
            "RBS": "http://identifiers.org/so/SO:0000139",
            "Regulatory": "http://identifiers.org/so/SO:0000167",
            "Reporter": "http://identifiers.org/so/SO:0000804",
            "RNA": "http://identifiers.org/so/SO:0000834",
            "Scar": "http://identifiers.org/so/SO:0001953",
            "Signalling": "http://identifiers.org/so/SO:0000804",
            "T7": "http://identifiers.org/so/SO:0001207",
            "Tag": "http://identifiers.org/so/SO:0000324",
            "Temporary": "http://identifiers.org/so/SO:0000110",
            "Terminator": "http://identifiers.org/so/SO:0000141",
            "Translational_Unit": "http://identifiers.org/so/SO:0000804"
        }

        if(soTermz[part.part_type.trim()] !== undefined)
            componentDefinition.addRole(soTermz[part.part_type.trim()])

    } else {
            componentDefinition.addRole("http://identifiers.org/so/SO:0000110")
    }

    if(part.notes.trim().length > 0)
        componentDefinition.addHtmlAnnotation(sbhTermNS + 'mutableNotes', part.notes.trim());

    if (part.sequence.trim().length > 0) {
	var sequence = sbol.sequence();
	sequence.version = '1'
	sequence.elements = part.sequence;
	sequence.encoding = terms.dnaSequence;
	sequence.displayId = part.part_name.replace(/[\W]+/g,"_") + '_sequence'
	sequence.wasDerivedFrom = 'http://parts.igem.org/Part:' + part.part_name;
	sequence.addUriAnnotation(provNS + 'wasGeneratedBy', 'https://synbiohub.org/public/igem/igem2sbol/1')
	sequence.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/myers')
	sequence.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/james')
	sequence.persistentIdentity = igemNS + sequence.displayId
	sequence.uri = sequence.persistentIdentity + '/' + sequence.version
	componentDefinition.addSequence(sequence);
	//Seqs[cdUri] = sequence
    }

    var partFeatures = [];

    if(part.features)
        partFeatures = part.features.map(getFeature);

    partFeatures.forEach(function(feature) {

        var featureComponentDefinition;

        if(feature.start_pos === 0 || feature.end_pos === 0)
            return

        if(part.specified_u_list != "_" + part.part_id + "_" && feature.feature_type === 'BioBrick') {

            if(feature.label == part.part_name)
            {
                return;
            }

            var subpart = bioBricks[feature.label];

            if(!subpart) {
                console.log('could not find subpart ' + feature.label);
		return;
            } else {
                // TODO: would like to use specified, but features seem to be missing
                if (!part.specified_u_list.includes("_"+subpart.part_id+"_") &&
                      !part.deep_u_list.includes("_"+subpart.part_id+"_")) 
                {
                  return;
	        }
                featureComponentDefinition = partToComponentDefinition(sbol, subpart);
            }
        } else if(part.specified_u_list != "_" + part.part_id + "_" && feature.feature_type != 'BioBrick') {
	    return;
	}

        var labelOrType = ''

        if(feature.label && feature.label.length > 0)
            labelOrType = feature.label

        if(labelOrType.length === 0 && feature.label2 && feature.label2.length > 0)
            labelOrType = feature.label2

        if(labelOrType.length === 0 && feature.type && feature.type.length > 0)
            labelOrType = feature.type

        if(labelOrType.length === 0 && feature.feature_type && feature.feature_type.length > 0)
            labelOrType = feature.feature_type

        if(labelOrType.length === 0)
            labelOrType = feature.feature_id + ''

        assert(labelOrType.length > 0)

/*
        if(!featureComponentDefinition)
        {
            featureComponentDefinition = sbol.componentDefinition();

            featureComponentDefinition.addType(terms.dnaRegion);
            featureComponentDefinition.wasDerivedFrom = 'http://parts.igem.org/Part:' + part.part_name;
            featureComponentDefinition.name = labelOrType
            featureComponentDefinition.displayId = componentDefinition.displayId + '_feature' + feature.feature_id
            featureComponentDefinition.persistentIdentity = componentDefinition.persistentIdentity + '_feature' + feature.feature_id;
            featureComponentDefinition.version = componentDefinition.version
            featureComponentDefinition.uri = featureComponentDefinition.persistentIdentity + '/' + featureComponentDefinition.version
            featureComponentDefinition.description = feature.type;

            var term = mapFeatureTerm(feature.feature_type);

            if(term) {
                featureComponentDefinition.addRole(term);
            }

            var featureSequence = sbol.sequence()
            featureSequence.displayId = featureComponentDefinition.displayId + '_sequence'
            featureSequence.name = labelOrType
            featureSequence.version = componentDefinition.version
            featureSequence.persistentIdentity = featureComponentDefinition.persistentIdentity + '_sequence';
            featureSequence.uri = featureComponentDefinition.persistentIdentity + '_sequence/' + featureSequence.version
            featureSequence.elements = part.sequence.slice(feature.start_pos - 1, feature.end_pos - 1);
            featureSequence.encoding = terms.dnaSequence;
            featureComponentDefinition.addSequence(featureSequence);
        }*/

	var featureComponent

	if(featureComponentDefinition) {

		featureComponent = sbol.component();
		featureComponent.displayId = 'component' + feature.feature_id + ''
		featureComponent.name = labelOrType
		featureComponent.version = componentDefinition.version
		featureComponent.persistentIdentity = componentDefinition.persistentIdentity + '/' + featureComponent.displayId
		featureComponent.uri = componentDefinition.persistentIdentity + '/' + featureComponent.displayId + '/' + featureComponent.version
		featureComponent.definition = featureComponentDefinition;

		componentDefinition.addComponent(featureComponent);
	}

        var sequenceAnnotation = sbol.sequenceAnnotation();
        sequenceAnnotation.displayId = 'annotation' + feature.feature_id;
        sequenceAnnotation.persistentIdentity = componentDefinition.persistentIdentity + '/' + sequenceAnnotation.displayId
        sequenceAnnotation.uri = sequenceAnnotation.persistentIdentity + '/' + componentDefinition.version
        sequenceAnnotation.version = componentDefinition.version
        sequenceAnnotation.name = labelOrType
        componentDefinition.addSequenceAnnotation(sequenceAnnotation);


	if(featureComponent) {

		sequenceAnnotation.component = featureComponent;

    } else {

            var term = mapFeatureTerm(feature.feature_type);

            if(term) {
                sequenceAnnotation.addRole(term);
            }

            sequenceAnnotation.addRole(igemTermNS+'feature/' + feature.feature_type)
    }


        var range = sbol.range();
        range.displayId = 'range' + feature.feature_id;
        range.persistentIdentity = sequenceAnnotation.persistentIdentity + '/' + range.displayId
        range.version = componentDefinition.version
        range.uri = range.persistentIdentity + '/' + range.version
        range.start = feature.start_pos;
        range.end = feature.end_pos;
        range.orientation = 'http://sbols.org/v2#inline'
        // TODO: feature reverse does not seem to mean on reverseComplement strand, added as iGEM annotation
        range.addUriAnnotation(igemTermNS + 'direction', feature.reverse === 0 ? igemTermNS+'direction/forward' : igemTermNS+'direction/reverse');
        //range.orientation = feature.reverse === 0 ? 'http://sbols.org/v2#inline' : 'http://sbols.org/v2#reverseComplement'
        //range.orientation   feature.reverse?

        sequenceAnnotation.addLocation(range);

    });

    cats.forEach(function(category) {

        category = category.trim();
        category = category.toLowerCase();
	category = category.replace('-','_');
        category = category.split('//').join('');

        if(category.length > 0) {

            var rootCategory = category.split('/')[0];

            var catUri = igemNS + '/' + category.replace(/[\W]+/g,"_") + '/1'

            //componentDefinition.addUriAnnotation(igemTermNS + 'category', catUri)

            var cat = collections[catUri]

            if(cat === undefined) {

                const tokens = category.split('/')

                var parentCategory = null

                var igemcaturl = igemNS + 'categories/1'
                    var igemcat

                    if(!collections[igemcaturl]) {

                        igemcat = collections[igemcaturl] = sbol.collection()

                        igemcat.version = '1'
                        igemcat.displayId = 'categories'
                        igemcat.name = 'iGEM Parts Registry Categories'
                        igemcat.persistentIdentity = igemNS + igemcat.displayId
			igemcat.wasDerivedFrom = 'http://parts.igem.org'
			igemcat.addUriAnnotation(provNS + 'wasGeneratedBy', 'https://synbiohub.org/public/igem/igem2sbol/1')
			igemcat.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/myers')
			igemcat.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/james')
                        igemcat.uri = igemcaturl

                    } else {

                        igemcat = collections[igemcaturl]


                    }

                tokens.forEach((token) => {

                    var pcat = {}
                    pcat.version = '1'
		    if ( !isNaN(parseInt(token)) ) {
			token = "_" + token
                    }

                    if(parentCategory) {

			pcat.displayId = parentCategory.displayId + '_' + token
                        pcat.name = parentCategory.name + '/' + token

                    } else {

			pcat.displayId = token
                        pcat.name = '//' + token

                    }

                    pcat.persistentIdentity = igemNS + pcat.displayId
                    pcat.uri = pcat.persistentIdentity + '/' + pcat.version



                    var newcat

                    if(!collections[pcat.uri]) {

                        newcat = collections[pcat.uri] = sbol.collection()

                        newcat.version = pcat.version
                        newcat.displayId = pcat.displayId
                        newcat.name = pcat.name
                        newcat.persistentIdentity = pcat.persistentIdentity
                        newcat.uri = pcat.uri
			newcat.wasDerivedFrom = 'http://parts.igem.org'
			newcat.addUriAnnotation(provNS + 'wasGeneratedBy', 'https://synbiohub.org/public/igem/igem2sbol/1')
			newcat.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/myers')
			newcat.addUriAnnotation(sbhTermNS + 'ownedBy', 'https://synbiohub.org/user/james')

                        if(!parentCategory) {

                            igemcat.addMember(newcat)

                        }

                    } else {

                        newcat = collections[pcat.uri]


                    }
                    

                    if(parentCategory) {

                        parentCategory.addMember(newcat)

                    }

                    parentCategory = newcat

                })

                cat = collections[parentCategory.persistentIdentity] = parentCategory
            }

            cat.addMember(componentDefinition)
        }
    });

    return componentDefinition;
}

function mapFeatureTerm(featureType) {

    return ({
        "barcode": "http://identifiers.org/so/SO:0000807",
        "binding": "http://identifiers.org/so/SO:0001091",
        "BioBrick": "http://identifiers.org/so/SO:0000804",
        "dna": "http://identifiers.org/so/SO:0000110",
        "misc": "http://identifiers.org/so/SO:0000110",
        "mutation": "http://identifiers.org/so/SO:0001059",
        "polya": "http://identifiers.org/so/SO:0000553",
        "primer_binding": "http://identifiers.org/so/SO:0005850",
        "protein": "http://identifiers.org/so/SO:0000316",
        "s_mutation": "http://identifiers.org/so/SO:1000008",
        "start": "http://identifiers.org/so/SO:0000318",
        "stop": "http://identifiers.org/so/SO:0000319",
        "tag": "http://identifiers.org/so/SO:0000324",
        "promoter": "http://identifiers.org/so/SO:0000167",
        "cds": "http://identifiers.org/so/SO:0000316",
        "operator": "http://identifiers.org/so/SO:0000057",
        "terminator": "http://identifiers.org/so/SO:0000141",
        "conserved": "http://identifiers.org/so/SO:0000330",
        "rbs": "http://identifiers.org/so/SO:0000139",
        "stem_loop": "http://identifiers.org/so/SO:0000313"
    })[featureType]

}



