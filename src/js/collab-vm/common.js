// CollabVM webapp configuration

const root="/collab-vm/";

export default {
    DEBUG: false,
    DEBUG_NO_TIMEOUT: false,
    DEBUG_NO_NSFW: false,
    DEBUG_NO_CONNECT: false, // is this used?
    DEBUG_VM_LIST: false,
    DEBUG_VM_LIST: false,

    debugLog: function() {
        if(this.DEBUG)
            console.log.apply(null, arguments);
    },

    /** @const
     * The root directory of the collab-vm project with a
     * forward slash appended to it.
     * This is determined at runtime to allow the project to be
     * relocated without needing to recompile the javascript.
     * @type {string}
     */
    rootDir: root,
    chatSound: root + "notify",

    /**
     * Additional nodes to connect to.
     * Uses multicollab() to do so
     * @const
     */
    additionalNodes: [
    ],  
    
    /**
     * Additional secure nodes to connect to.
     * Uses multicollab(%s, true) to do so
     * @const
     */
     
    additionalNodesSecure: [
        "computernewb.com/collab-vm/vm0",
        "computernewb.com/collab-vm/vm1",
        "computernewb.com/collab-vm/vm2",
        "computernewb.com/collab-vm/vm3",
        "computernewb.com/collab-vm/vm4",
        "computernewb.com/collab-vm/vm5",
        "computernewb.com/collab-vm/vm6",
        "computernewb.com/collab-vm/vm7",
        "computernewb.com/collab-vm/vm8"
    ],

    /**
     * Nodes that should have a blur effect applied to them.
     * @const
     */
    blurNodes: [
        "vm0b0t"
    ]
};
