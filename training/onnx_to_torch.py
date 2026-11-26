"""Load the shipped phone reader (ONNX) as a trainable PyTorch model.
The two SAME_UPPER layers (stride 1, 2x2 kernel) always pad one pixel at the end, so they are rewritten to
explicit padding first; the result matches ONNX Runtime."""
import onnx
import torch
from onnx2torch import convert

def explicit_padding(model):
    for node in model.graph.node:
        if node.op_type not in ("Conv", "MaxPool"):
            continue
        attrs = {a.name: a for a in node.attribute}
        if "auto_pad" in attrs and onnx.helper.get_attribute_value(attrs["auto_pad"]) == b"SAME_UPPER":
            strides = onnx.helper.get_attribute_value(attrs["strides"]) if "strides" in attrs else [1, 1]
            assert list(strides) == [1, 1], strides
            if node.op_type == "MaxPool":
                kernel = onnx.helper.get_attribute_value(attrs["kernel_shape"])
            else:
                weight = next(i for i in model.graph.initializer if i.name == node.input[1])
                kernel = list(weight.dims[2:])
            total = [k - 1 for k in kernel]
            begin = [t // 2 for t in total]
            end = [t - b for t, b in zip(total, begin)]
            node.attribute.remove(attrs["auto_pad"])
            node.attribute.extend([onnx.helper.make_attribute("pads", begin + end)])
    return model

def load_torch(path):
    model = explicit_padding(onnx.load(path))
    return convert(model)
