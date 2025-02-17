from PIL import Image
import pandas as pd
import ast 
import os
import json

def crop_image(input_image_path, output_image_path, crop_area):
    """
    Crops an image to the specified area and saves it to a new file.

    Parameters:
    - input_image_path: Path to the input image.
    - output_image_path: Path where the cropped image will be saved.
    - crop_area: A tuple of (x, y, width, height) specifying the area to crop.
    """
    # Open the input image
    image = Image.open(input_image_path)
    
    # Calculate the right and lower coordinates for the crop box
    
    x = crop_area['x']
    # Height = y + (ImageHeight - WindowScrollHeight) (if y > WindowHeight (viewpoint))
    y = crop_area['y'] 
    # print('before', y)
    # if y > crop_area['windowHeight']:
    #     print(y, image.size[1], crop_area['totalPageHeight'])
    #     y = y + (image.size[1] - crop_area['totalPageHeight'])
    # print('after', y)
    
    width = crop_area['width']
    height = crop_area['height'] 
    crop_box = (x, y, x + width, y + height)
    
    # Crop the image and save the result
    cropped_image = image.crop(crop_box)
    cropped_image.save(output_image_path)


def crop_images_answers_csv(file_name = 'Answer.csv', png_file='file.png'):
    df = pd.read_csv(file_name)
    print(df)
    # Step 1: Extract the string value from the ObjectId fields
    df['_id'] = df['_id'].str.extract(r'ObjectId\("(.+)"\)')
    df['pid'] = df['pid'].str.extract(r'ObjectId\("(.+)"\)')

    # Step 2: Filter rows where tagType is a number
    # df['tagType'] = pd.to_numeric(df['tagType'], errors='coerce')

    # df = df[df['tagType'].notnull()]

    # Step 3: Convert boundingBox from string to dictionary
    df['boundingBox'] = df['boundingBox'].apply(ast.literal_eval)

    # Step 4: Ensure hyuIndex is of type int
    df['hyuIndex'] = df['hyuIndex'].astype(int)
    # df['tagType'] = df['tagType'].astype(int)
    
    if not os.path.exists('segments'):
        os.makedirs('segments')
        
    # Go through df
    for index, row in df.iterrows():
        pid = row['pid']
        # input_path = f'src/project/api/static/screenshots/{pid}.png'
        input_path = png_file
        output_path = f"segments/{pid}_{row['hyuIndex']}_{row['tagType']}.png"
        crop_image(input_path, output_path, row['boundingBox'])

def get_image_size(image_path):
    with Image.open(image_path) as img:
        return img.size  # Returns a tuple (width, height)
    
def compare_image_sizes(image_path1, image_path2):
    size1 = get_image_size(image_path1)
    size2 = get_image_size(image_path2)

    print(f"Image 1 ({image_path1}): {size1[0]}x{size1[1]}")
    print(f"Image 2 ({image_path2}): {size2[0]}x{size2[1]}")

    if size1 == size2:
        print("The images have the same size.")
    else:
        print("The images have different sizes.")

def get_items_jsonl(file):
    items = []
    with open(file, 'r') as f:
        for line in f:
            item = json.loads(line)
            items.append(item)
            if len(items) == 5:
                break
    return items

def csv_to_json_mongo_export(file, url_column, source_name):
    df = pd.read_csv(file)
    df['source'] = source_name
    df['url'] = df[url_column]
    df_to_json = df[['url', 'source']]
    df_to_json.to_json(file[:-4] + '.json', orient='records')
    
def jsonl_to_json_mongo_export(file, source_name, n):
    items = []
    with open(file, 'r') as f:
        for line in f:
            item = json.loads(line)
            items.append(item)
            if len(items) == n:
                break
    
    df = pd.DataFrame(items)
    df['source'] = source_name
    df_to_json = df[['url', 'source', 'page_id']]
    df_to_json.to_json(file[:-4] + '.json', orient='records')
    
                       
if __name__ == '__main__':
    size1 = get_image_size('www.horgen.ch_.png')
    print(size1)
    crop_images_answers_csv('Answer_horgen_laptop_pixelratio1.csv', png_file = 'www.horgen.ch_.png' )#'Hittnau_scrapy.png')
    
    # # Example Usage
    # pid = '66a8b44b643a7d7e598b216e'
    # input_path = f'src/project/api/static/screenshots/{pid}.png'
    # output_path = 'test_cropped_image.png'
    # crop_area ={"height":290.984375,"width":1157,"x":104,"y":2441.6875}
    # crop_image(input_path, output_path, crop_area)

    
    # # Compare sizes of images
    # image_path1 = 'Hittnau_chromeextension.png'
    # image_path2 = 'Hittnau_scrapy.png'
    # compare_image_sizes(image_path1, image_path2)
    
    
    # # Get items from a JSONL file
    # jsonl_to_json_mongo_export('interesting/all_items.jsonl', 'interesting', 5)
    
    