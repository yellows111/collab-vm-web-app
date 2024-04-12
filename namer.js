import { Namer } from "@parcel/plugin";
import { basename } from "path";
export default new Namer({
    name({bundle}) {
        var filename = basename(bundle.getMainEntry().filePath);
        if (filename === "collab-vm.js") return "all.min.js";
        return filename;
    }
});